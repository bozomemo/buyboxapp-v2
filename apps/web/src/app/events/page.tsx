import { requirePermission } from '@/lib/server/auth/page-guard';
import { EventsClient } from './events-client';

export const dynamic = 'force-dynamic';

export default async function EventsPage() {
  const gate = await requirePermission('view');
  if (!gate.ok) return gate.element;
  return <EventsClient />;
}
