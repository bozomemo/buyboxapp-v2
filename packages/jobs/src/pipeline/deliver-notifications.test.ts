/**
 * The notification outbox end to end (doc 17 §6, doc 07 §7.5–§7.6): a violation opening enqueues
 * one delivery per channel; a reopening inside the quiet period is `suppressed`; the job sends one
 * message per ready channel, leaves an unconfigured channel's rows pending with the reason, and
 * retries a failure until `NOTIFY_MAX_ATTEMPTS`.
 */
import type { NotificationChannel, NotificationMessage } from '@buybox/adapters';
import { Money, err, ok } from '@buybox/shared';
import {
  bandViolationsRepo,
  brandProductsRepo,
  configRepo,
  jobsRepo,
  notificationDeliveriesRepo,
  trackedProductsRepo,
} from '@buybox/db';
import type { CompetitorOffer } from '@buybox/adapters';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildAdapterRegistry } from '../adapter-registry.js';
import { FakeClock } from '../clock.js';
import type { JobContext } from '../job.js';
import { NOTIFICATION_RECIPIENTS_SETTING_KEY, NOTIFY_MAX_ATTEMPTS, readNotificationRecipients } from '../notify-config.js';
import { createSqliteTestDb, NOW, seedMarketplace, type TestDb } from '../test-helpers.js';
import { evaluateCardBand } from './band-alarm.js';
import { deliverNotifications } from './deliver-notifications.js';

const HOUR = 60 * 60_000;

function offer(price: bigint, sellerRef = 's1'): CompetitorOffer {
  return {
    rank: 1,
    sellerRef,
    sellerName: `Satıcı ${sellerRef}`,
    sellerRating: null,
    listingRef: null,
    price: Money.fromKurus(price),
    finalPrice: null,
    offeredStock: null,
    dispatchTime: null,
    hasPromotion: false,
    promotionText: null,
    isWinner: true,
  };
}

class FakeChannel implements NotificationChannel {
  readonly sent: NotificationMessage[] = [];
  constructor(
    readonly code: 'webhook' | 'email' | 'sms',
    private readonly behaviour: { ready?: boolean; fail?: boolean } = {},
  ) {}
  readiness() {
    return this.behaviour.ready === false ? { ready: false as const, reason: `${this.code} kapalı` } : { ready: true as const };
  }
  async send(message: NotificationMessage) {
    this.sent.push(message);
    return this.behaviour.fail ? err({ detail: 'boom' }) : ok<void, { detail: string }>(undefined);
  }
}

describe('notifications (doc 17 §6)', () => {
  let db: TestDb;
  let link: brandProductsRepo.CardLink;

  beforeEach(async () => {
    db = await createSqliteTestDb();
    await seedMarketplace(db.appDb);
    // `app_events.job_run_id` references a run; the failure path logs against this one.
    await jobsRepo.startJobRun(db.appDb, {
      id: 'test',
      jobName: 'DeliverNotifications',
      startedAt: NOW,
      finishedAt: null,
      state: 'running',
      itemsTotal: 0,
      itemsOk: 0,
      itemsFailed: 0,
      error: null,
      correlationId: 'test',
      jobQueueId: null,
    });
    await trackedProductsRepo.addTrackedProduct(db.appDb, {
      id: 'tp1',
      marketplaceCode: 'trendyol',
      productRef: '1',
      productUrl: '/x-p-1',
      label: 'Kart 1',
      isActive: true,
      addedAt: NOW,
    });
    await brandProductsRepo.insertBrandProduct(db.appDb, {
      id: 'bp1',
      name: 'Ton 85g',
      referencePrice: 100_00n,
      minPrice: 80_00n,
      maxPrice: null,
      barcode: null,
      source: 'manual',
      referencePriceSource: null,
      unitPrice: null,
      desi: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await brandProductsRepo.linkCard(db.appDb, {
      id: 'c1',
      brandProductId: 'bp1',
      trackedProductId: 'tp1',
      unitMultiplier: 1,
      isPrimary: true,
      linkSource: 'manual',
      linkedAt: NOW,
    });
    link = (await brandProductsRepo.cardLinksForTrackedProducts(db.appDb, ['tp1'])).get('tp1')!;
  });

  afterEach(() => db.cleanup());

  function ctx(nowMs: number): JobContext {
    return {
      appDb: db.appDb,
      clock: new FakeClock(nowMs),
      adapters: buildAdapterRegistry([]),
      correlationId: 'test',
      payload: '{}',
      reportProgress: () => {},
    };
  }

  async function deliveries() {
    const [open] = await bandViolationsRepo.queryBandViolations(db.appDb, { state: 'open' });
    const all = await notificationDeliveriesRepo.deliveriesForSubjects(db.appDb, 'bandViolation', open ? [open.id] : []);
    return open ? (all.get(open.id) ?? []) : [];
  }

  it('an opening enqueues one pending delivery per channel; a confirmation enqueues nothing', async () => {
    await evaluateCardBand(ctx(NOW), 'tp1', link, [offer(70_00n)], NOW);
    await evaluateCardBand(ctx(NOW + HOUR), 'tp1', link, [offer(69_00n)], NOW + HOUR);

    const rows = await deliveries();
    expect(rows.map((r) => [r.channel, r.state]).sort()).toEqual([
      ['email', 'pending'],
      ['sms', 'pending'],
      ['webhook', 'pending'],
    ]);
  });

  it('the same seller reopening inside the quiet period is recorded but suppressed', async () => {
    await evaluateCardBand(ctx(NOW), 'tp1', link, [offer(70_00n)], NOW);
    await evaluateCardBand(ctx(NOW + HOUR), 'tp1', link, [offer(90_00n)], NOW + HOUR); // back in band
    await evaluateCardBand(ctx(NOW + 2 * HOUR), 'tp1', link, [offer(70_00n)], NOW + 2 * HOUR); // reopens

    const rows = await deliveries();
    expect(rows.every((r) => r.state === 'suppressed')).toBe(true);
    expect(rows).toHaveLength(3);
  });

  it('another seller reopening inside the quiet period is a new fact and is notified', async () => {
    await evaluateCardBand(ctx(NOW), 'tp1', link, [offer(70_00n, 's1')], NOW);
    await evaluateCardBand(ctx(NOW + HOUR), 'tp1', link, [offer(90_00n, 's1')], NOW + HOUR);
    await evaluateCardBand(ctx(NOW + 2 * HOUR), 'tp1', link, [offer(70_00n, 's2')], NOW + 2 * HOUR);

    expect((await deliveries()).every((r) => r.state === 'pending')).toBe(true);
  });

  it('sends one message per ready channel, waits on an unready one, retries a failure', async () => {
    await evaluateCardBand(ctx(NOW), 'tp1', link, [offer(70_00n)], NOW);
    const webhook = new FakeChannel('webhook');
    const email = new FakeChannel('email', { ready: false });
    const sms = new FakeChannel('sms', { fail: true });

    const result = await deliverNotifications(ctx(NOW + 60_000), { channels: [webhook, email, sms] });

    expect(result).toEqual({ itemsTotal: 3, itemsOk: 1, itemsFailed: 1 });
    expect(webhook.sent).toHaveLength(1);
    expect(webhook.sent[0]!.text).toContain('Ton 85g — Kart 1 (trendyol): min altında');
    expect(email.sent).toHaveLength(0);
    const byChannel = new Map((await deliveries()).map((r) => [r.channel, r]));
    expect(byChannel.get('webhook')).toMatchObject({ state: 'sent', sentAt: NOW + 60_000 });
    expect(byChannel.get('email')).toMatchObject({ state: 'pending', attempts: 0, lastError: 'bildirilmedi: email kapalı' });
    expect(byChannel.get('sms')).toMatchObject({ state: 'pending', attempts: 1, lastError: 'boom' });

    // A sent row is never sent again.
    await deliverNotifications(ctx(NOW + 120_000), { channels: [webhook] });
    expect(webhook.sent).toHaveLength(1);
  });

  it('a channel failing NOTIFY_MAX_ATTEMPTS times marks its rows failed', async () => {
    await evaluateCardBand(ctx(NOW), 'tp1', link, [offer(70_00n)], NOW);
    const sms = new FakeChannel('sms', { fail: true });
    for (let i = 0; i < NOTIFY_MAX_ATTEMPTS + 2; i += 1) {
      await deliverNotifications(ctx(NOW + i * 60_000), { channels: [sms] });
    }
    expect(sms.sent).toHaveLength(NOTIFY_MAX_ATTEMPTS);
    const row = (await deliveries()).find((r) => r.channel === 'sms');
    expect(row).toMatchObject({ state: 'failed', attempts: NOTIFY_MAX_ATTEMPTS });
  });

  it('recipients are read from the setting; an unreadable row is no recipients, never a crash', async () => {
    expect(await readNotificationRecipients(db.appDb)).toEqual({ email: [], sms: [] });
    await configRepo.setAppSetting(
      db.appDb,
      {
        key: NOTIFICATION_RECIPIENTS_SETTING_KEY,
        value: JSON.stringify({ email: ['a@x.com'], sms: ['05321234567'] }),
        updatedBy: 'test',
        updatedAt: NOW,
      },
      'audit-1',
    );
    expect(await readNotificationRecipients(db.appDb)).toEqual({ email: ['a@x.com'], sms: ['+905321234567'] });
  });
});
