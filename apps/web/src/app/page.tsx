import { redirect } from 'next/navigation';
import { configRepo } from '@buybox/db';
import { getAppDb, isBootstrapped } from '@/lib/server/db';
import { DashboardClient } from './dashboard-client';

export const dynamic = 'force-dynamic';

async function isSetupComplete(): Promise<boolean> {
  if (!isBootstrapped()) return false;
  try {
    const setting = await configRepo.getAppSetting(getAppDb(), 'setup.completed');
    return setting?.value === 'true';
  } catch {
    return false; // e.g. migrations not yet run against a freshly-chosen database
  }
}

export default async function DashboardPage() {
  if (!(await isSetupComplete())) {
    redirect('/setup');
  }

  return <DashboardClient />;
}
