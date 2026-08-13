import { EventsClient } from './events-client';

export const dynamic = 'force-dynamic';

export default function EventsPage() {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">Olaylar</h1>
      <EventsClient />
    </div>
  );
}
