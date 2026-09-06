'use client';

import { useEffect, useState } from 'react';
import {
  loadWizardProgress,
  saveWizardProgress,
  STEP_LABELS,
  WIZARD_STEPS,
  type WizardStep,
} from './wizard-types';
import { Step1Database } from './steps/step1-database';
import { Step2StoreIdentity } from './steps/step2-store-identity';
import { Step3Marketplaces } from './steps/step3-marketplaces';
import { Step4Fees } from './steps/step4-fees';
import { Step5Policy } from './steps/step5-policy';
import { Step6ProductSource } from './steps/step6-product-source';
import { Step7Erp } from './steps/step7-erp';
import { Step8Review } from './steps/step8-review';

/**
 * The first-run setup wizard (doc 10 §6, doc 06 §1 `/setup`). Each step tests and persists its
 * own data through an API route as soon as the operator confirms it — the wizard's local state
 * only tracks *which step is showing*, so leaving and returning mid-way never loses already
 * committed configuration (only the current, unsaved step).
 *
 * *Which* step is showing is itself remembered across a reload, in `localStorage`
 * (`wizard-types.ts`'s `loadWizardProgress`/`saveWizardProgress`) — before this, a reload always
 * dropped the operator back at step 1 regardless of how far they had gotten, which read exactly
 * like the "already answered, asked again" defect this pass exists to close even though nothing
 * they had saved was actually lost (doc 15 §6, Phase 6).
 */
export default function SetupWizard() {
  const [stepIndex, setStepIndex] = useState(0);
  const [databaseReady, setDatabaseReady] = useState(false);
  const [enabledMarketplaces, setEnabledMarketplaces] = useState<('trendyol' | 'hepsiburada')[]>([]);
  // Restored client-side only, after mount: reading `localStorage` during the initial render
  // would disagree with the server-rendered markup (SSR has no `window`) and React would warn
  // about a hydration mismatch. A one-frame flash of "step 1" before this runs is the trade-off.
  const [restored, setRestored] = useState(false);
  const step: WizardStep = WIZARD_STEPS[stepIndex]!;

  useEffect(() => {
    const progress = loadWizardProgress();
    if (progress) {
      setStepIndex(progress.stepIndex);
      setDatabaseReady(progress.databaseReady);
      setEnabledMarketplaces(progress.enabledMarketplaces);
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return; // don't overwrite a saved position with the initial defaults
    saveWizardProgress({ stepIndex, databaseReady, enabledMarketplaces });
  }, [restored, stepIndex, databaseReady, enabledMarketplaces]);

  function next() {
    setStepIndex((i) => Math.min(i + 1, WIZARD_STEPS.length - 1));
  }
  function back() {
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold">Kurulum Sihirbazı</h1>
        <p className="text-sm text-(--color-muted)">
          Adım {stepIndex + 1} / {WIZARD_STEPS.length} — {STEP_LABELS[step]}
        </p>
      </div>

      <ol className="flex flex-wrap gap-2 text-xs">
        {WIZARD_STEPS.map((s, i) => (
          <li
            key={s}
            className={`rounded-full px-3 py-1 ${
              i === stepIndex
                ? 'bg-(--color-accent) text-(--color-accent-ink)'
                : i < stepIndex
                  ? 'bg-(--color-success-bg) text-(--color-success)'
                  : 'bg-(--color-chip-bg) text-(--color-muted)'
            }`}
          >
            {STEP_LABELS[s]}
          </li>
        ))}
      </ol>

      <div className="rounded-lg border border-(--color-border) bg-(--color-surface) p-6">
        {step === 'database' && (
          <Step1Database
            onDone={() => {
              setDatabaseReady(true);
              next();
            }}
          />
        )}
        {step === 'store-identity' && <Step2StoreIdentity onDone={next} onBack={back} />}
        {step === 'marketplaces' && (
          <Step3Marketplaces
            onDone={(codes) => {
              setEnabledMarketplaces(codes);
              next();
            }}
            onBack={back}
          />
        )}
        {step === 'fees' && (
          <Step4Fees enabledMarketplaces={enabledMarketplaces} onDone={next} onBack={back} />
        )}
        {step === 'policy' && (
          <Step5Policy enabledMarketplaces={enabledMarketplaces} onDone={next} onBack={back} />
        )}
        {step === 'product-source' && <Step6ProductSource onDone={next} onBack={back} />}
        {step === 'erp' && <Step7Erp onDone={next} onBack={back} onSkip={next} />}
        {step === 'review' && <Step8Review onBack={back} />}
      </div>

      {!databaseReady && step !== 'database' && (
        <p className="text-sm text-(--color-warning)">
          Not: veritabanı adımı bu oturumda henüz onaylanmadı; bu sayfaya elle geldiyseniz önce o adımı
          tamamlayın.
        </p>
      )}
    </div>
  );
}
