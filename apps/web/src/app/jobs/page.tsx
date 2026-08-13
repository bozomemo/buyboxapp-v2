import { JobsClient } from './jobs-client';

export const dynamic = 'force-dynamic';

export default function JobsPage() {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">İşler</h1>
      <JobsClient />
    </div>
  );
}
