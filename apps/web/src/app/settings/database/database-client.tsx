'use client';

import { useEffect, useState } from 'react';

interface Info {
  dialect: string;
  connection: string;
  schemaVersion: { upToDate: boolean; appliedCount: number; expectedCount: number };
}

export function DatabaseClient() {
  const [info, setInfo] = useState<Info | null>(null);

  useEffect(() => {
    fetch('/api/settings/database')
      .then((r) => r.json())
      .then((data: Info) => setInfo(data))
      .catch(() => undefined);
  }, []);

  if (!info) return <p className="text-(--color-muted)">Yükleniyor…</p>;

  return (
    <div className="max-w-md rounded border border-(--color-border) p-4">
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-(--color-muted)">Motor</dt>
          <dd className="font-medium">{info.dialect}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-(--color-muted)">Bağlantı</dt>
          <dd className="font-mono text-xs">{info.connection}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-(--color-muted)">Şema Sürümü</dt>
          <dd
            className={
              info.schemaVersion.upToDate ? 'text-(--color-success)' : 'text-(--color-danger)'
            }
          >
            {info.schemaVersion.appliedCount}/{info.schemaVersion.expectedCount} göç uygulandı
            {info.schemaVersion.upToDate ? ' (güncel)' : ' (güncel değil)'}
          </dd>
        </div>
      </dl>
    </div>
  );
}
