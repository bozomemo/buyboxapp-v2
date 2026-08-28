/**
 * The audit thresholds in force (doc 06 §12.4, Faz 6).
 *
 * Faz 6's definition of done says no threshold is buried in the code, and this is what makes
 * that true: `DEFAULT_AUDIT_THRESHOLDS` in `packages/core` is a starting point, and the stored
 * override in `app_settings` is what actually runs. It lives here rather than in the settings
 * route because two routes must read the same numbers — the one that edits them and the one
 * that derives findings with them — and a screen showing 15% while the report ran at 20% would
 * be worse than either number alone.
 */
import { DEFAULT_AUDIT_THRESHOLDS, type AuditThresholds } from '@buybox/core';
import { configRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

export const AUDIT_THRESHOLDS_KEY = 'brandAudit.thresholds';

/**
 * Merged over the defaults rather than used as-is, for the reason `settings/retention` gives at
 * length: a value stored before a threshold existed carries no key for it, and passing
 * `undefined` through would turn that comparison into `NaN` — a finding that silently stops
 * firing on every install that has saved this row once.
 */
export async function readAuditThresholds(): Promise<{
  thresholds: AuditThresholds;
  isDefault: boolean;
}> {
  const setting = await configRepo.getAppSetting(getAppDb(), AUDIT_THRESHOLDS_KEY);
  const thresholds: AuditThresholds = setting
    ? { ...DEFAULT_AUDIT_THRESHOLDS, ...(JSON.parse(setting.value) as Partial<AuditThresholds>) }
    : DEFAULT_AUDIT_THRESHOLDS;
  return { thresholds, isDefault: !setting };
}

/**
 * Only the keys the type declares are stored, and only as finite non-negative numbers.
 *
 * A body carrying `NaN` or a string would survive `JSON.parse` on the way back in and would
 * then be compared against a deviation, where every comparison with `NaN` is false — the
 * finding disappears and nothing says so. Rejected here instead, by the name of the key.
 */
export function parseAuditThresholds(
  body: unknown,
): { ok: true; value: AuditThresholds } | { ok: false; message: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, message: 'Gövde bir nesne değil.' };
  }
  const input = body as Record<string, unknown>;
  const result: Record<string, number> = {};
  for (const key of Object.keys(DEFAULT_AUDIT_THRESHOLDS)) {
    const raw = input[key];
    if (raw === undefined || raw === null || raw === '') {
      result[key] = DEFAULT_AUDIT_THRESHOLDS[key as keyof AuditThresholds];
      continue;
    }
    const value = typeof raw === 'string' ? Number(raw) : raw;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      return { ok: false, message: `"${key}" sayı olmalı ve negatif olamaz.` };
    }
    result[key] = value;
  }
  return { ok: true, value: result as unknown as AuditThresholds };
}
