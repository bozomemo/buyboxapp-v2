'use client';

import { useState } from 'react';
import { STEP_LABELS, WIZARD_STEPS, type WizardStep } from './wizard-types';
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
 */
export default function SetupWizard() {
  const [stepIndex, setStepIndex] = useState(0);
  const [databaseReady, setDatabaseReady] = useState(false);
  const [enabledMarketplaces, setEnabledMarketplaces] = useState<('trendyol' | 'hepsiburada')[]>([]);
  const step: WizardStep = WIZARD_STEPS[stepIndex]!;

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
        <p className="text-sm text-[var(--color-muted)]">
          Adım {stepIndex + 1} / {WIZARD_STEPS.length} — {STEP_LABELS[step]}
        </p>
      </div>

      <ol className="flex flex-wrap gap-2 text-xs">
        {WIZARD_STEPS.map((s, i) => (
          <li
            key={s}
            className={`rounded-full px-3 py-1 ${
              i === stepIndex
                ? 'bg-[var(--color-accent)] text-white'
                : i < stepIndex
                  ? 'bg-green-100 text-green-800'
                  : 'bg-slate-100 text-[var(--color-muted)]'
            }`}
          >
            {STEP_LABELS[s]}
          </li>
        ))}
      </ol>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
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
        <p className="text-sm text-[var(--color-warning)]">
          Not: veritabanı adımı bu oturumda henüz onaylanmadı; bu sayfaya elle geldiyseniz önce o adımı
          tamamlayın.
        </p>
      )}
    </div>
  );
}
