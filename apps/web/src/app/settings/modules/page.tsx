import { SettingsNav } from '../settings-nav';
import { ModulesClient } from './modules-client';

export const dynamic = 'force-dynamic';

/**
 * Settings > Modüller (doc 17 §1). Also where the proxy sends a request for a disabled module's
 * screen, with `?disabled=<module>` naming what was asked for — so the operator lands on the
 * explanation and the switch, not on a dashboard with the screen they wanted quietly missing.
 */
export default async function SettingsModulesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { disabled } = await searchParams;
  const redirectedFrom = disabled === 'seller' || disabled === 'brand' ? disabled : null;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Ayarlar</h1>
      <SettingsNav />
      <ModulesClient redirectedFrom={redirectedFrom} />
    </div>
  );
}
