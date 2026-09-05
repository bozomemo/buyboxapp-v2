/**
 * Pushing a new audit finding to whoever should hear about it (2026-09-03).
 *
 * The brand audit was, until this existed, entirely **pull**: every signal it produces is
 * correct and none of it reaches anyone who is not looking at the screen. A brand manager is not
 * a person who opens a dashboard hourly, and the findings that matter most — a blocked seller
 * returning, a seller under the published price — are the ones where a day's delay costs the
 * most.
 *
 * ## What it deliberately is not
 *
 * Not an alerting platform. One transport, one message shape, no per-rule routing and no
 * severity escalation. The finding already carries its own ranking (`stated` before `measured`,
 * `packages/core`), and inventing a second, differently-tuned notion of importance here is how
 * the two come to disagree.
 *
 * ## What it will not do
 *
 * **It never says a violation happened.** The wording is the screen's wording: here is a thing,
 * here are the numbers, go look. A notification is read faster and trusted harder than a screen,
 * so it is the last place to start implying that software concluded something about a company.
 *
 * **It never sends a resolution.** A finding disappears either because the condition ended or
 * because somebody moved a threshold, and nothing here can tell those apart — a "resolved"
 * message would fire on every threshold edit and would teach the operator to ignore the channel.
 */
import type { brandFindingsRepo } from '@buybox/db';

/** What a transport has to implement. One method, so a test double is three lines. */
export interface IFindingNotifier {
  /** Rejects on failure — the caller leaves `notified_at` null and retries next run. */
  send(message: FindingNotification): Promise<void>;
}

export interface FindingNotification {
  readonly brandLabel: string;
  readonly findings: readonly brandFindingsRepo.BrandFindingRow[];
  /** How many were left out of `findings` by the per-message cap. */
  readonly omitted: number;
}

/**
 * At most this many findings are described in one message; the rest are counted.
 *
 * A first run over an established archive can open hundreds at once, and a message that pastes
 * all of them is one nobody reads — which is the same failure as sending nothing, arrived at
 * more expensively. The count still tells the operator to open the screen.
 */
export const MAX_FINDINGS_PER_MESSAGE = 10;

const KIND_TEXT: Record<string, string> = {
  blockedSellerPresent: 'Yasaklı satıcı satışta',
  belowReferencePrice: 'Tavsiye fiyatın altında',
  notOnAuthorisedList: 'Yetkili listesinde yok',
  deepDiscountOnOneProduct: 'Tek üründe derin indirim',
  persistentUndercut: 'Sistematik fiyat kırma',
  belowMarketAverage: 'Piyasa altı ortalama',
  unrelatedCategory: 'Alakasız kategori',
  brandRefDisagreement: 'Marka eşleşmesi uyuşmuyor',
  newSeller: 'Yeni görülen satıcı',
};

/**
 * The message body, as plain text.
 *
 * Pure and exported so the wording is testable without a network — which matters more here than
 * for most strings, because this is the one place the product speaks to someone who is not
 * looking at the caveats printed all over the screen.
 */
export function formatFindingMessage(message: FindingNotification): string {
  const lines = [
    `${message.brandLabel} — ${message.findings.length + message.omitted} yeni denetim bulgusu`,
    '',
  ];
  for (const finding of message.findings) {
    const subject = subjectName(finding);
    const kind = KIND_TEXT[finding.kind] ?? finding.kind;
    const basis = finding.basis === 'stated' ? 'kesin bilgi' : 'yorum';
    lines.push(`• ${kind}${subject === null ? '' : ` — ${subject}`} (${basis})`);
  }
  if (message.omitted > 0) {
    lines.push(`• …ve ${message.omitted} bulgu daha.`);
  }
  lines.push('');
  // The sentence that has to survive being forwarded without the rest of the product around it.
  lines.push('Bir bulgu ihlal iddiası değildir — bakılacak bir yeri gösterir.');
  return lines.join('\n');
}

/** The finding's subject, read out of its stored payload. `null` when the payload cannot say. */
function subjectName(finding: brandFindingsRepo.BrandFindingRow): string | null {
  try {
    const payload = JSON.parse(finding.payload) as {
      subject?: { kind?: string; name?: string; label?: string };
    };
    return payload.subject?.name ?? payload.subject?.label ?? null;
  } catch {
    // A payload we cannot parse is a bug worth not crashing a notification over: the finding's
    // kind and count are still worth sending, and the screen has the rest.
    return null;
  }
}

/**
 * Posts the message as JSON to one URL.
 *
 * Both a `text` field and a structured `findings` array, because the two audiences are different
 * and neither should have to parse the other: a chat webhook renders `text` as-is, and anything
 * programmatic reads the array. The payload carries no price, no seller and no product beyond
 * what the message already names — a webhook URL is a bearer token and its destination is
 * outside this system's control.
 */
export class WebhookFindingNotifier implements IFindingNotifier {
  constructor(
    private readonly url: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: FindingNotification): Promise<void> {
    const response = await this.fetchImpl(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: formatFindingMessage(message),
        brand: message.brandLabel,
        count: message.findings.length + message.omitted,
        findings: message.findings.map((f) => ({
          key: f.findingKey,
          kind: f.kind,
          basis: f.basis,
          firstSeenAt: f.firstSeenAt,
        })),
      }),
    });
    if (!response.ok) {
      throw new Error(`Findings webhook returned ${response.status}`);
    }
  }
}
