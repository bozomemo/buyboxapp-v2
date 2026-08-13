'use client';

import { useState } from 'react';
import { Button, Field, StatusBanner, TextInput } from '../ui';

type Engine = 'sqlite' | 'postgres' | 'mysql';

const DEFAULTS: Record<Engine, string> = {
  sqlite: 'file:./data/app.db',
  postgres: 'postgres://user:password@localhost:5432/buybox',
  mysql: 'mysql://user:password@localhost:3306/buybox',
};

export function Step1Database({ onDone }: { onDone: () => void }) {
  const [engine, setEngine] = useState<Engine>('sqlite');
  const [connectionString, setConnectionString] = useState(DEFAULTS.sqlite);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | undefined>();
  const [migrateResult, setMigrateResult] = useState<{ ok: boolean; message: string } | undefined>();
  const [busy, setBusy] = useState(false);

  async function testConnection() {
    setBusy(true);
    setTestResult(undefined);
    try {
      const res = await fetch('/api/setup/database/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine, connectionString }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      setTestResult({
        ok: data.ok,
        message: data.ok ? 'Bağlantı başarılı.' : (data.error ?? 'Bağlantı başarısız.'),
      });
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function migrate() {
    setBusy(true);
    setMigrateResult(undefined);
    try {
      const res = await fetch('/api/setup/database/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine, connectionString }),
      });
      const data = (await res.json()) as { ok: boolean; appliedCount?: number; error?: string };
      setMigrateResult({
        ok: data.ok,
        message: data.ok
          ? `Şema güncel (${data.appliedCount} migrasyon uygulandı).`
          : (data.error ?? 'Migrasyon başarısız.'),
      });
    } catch (e) {
      setMigrateResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="Veritabanı Motoru">
        <select
          value={engine}
          onChange={(e) => {
            const next = e.target.value as Engine;
            setEngine(next);
            setConnectionString(DEFAULTS[next]);
            setTestResult(undefined);
            setMigrateResult(undefined);
          }}
          className="rounded border border-[var(--color-border)] px-3 py-1.5 text-sm"
        >
          <option value="sqlite">SQLite (tek kullanıcılı yerel kurulum için önerilir)</option>
          <option value="postgres">PostgreSQL</option>
          <option value="mysql">MySQL</option>
        </select>
      </Field>

      <Field label="Bağlantı Bilgisi">
        <TextInput
          value={connectionString}
          onChange={(e) => setConnectionString(e.target.value)}
          placeholder={DEFAULTS[engine]}
        />
      </Field>

      <div className="flex gap-2">
        <Button variant="secondary" type="button" onClick={() => void testConnection()} disabled={busy}>
          Bağlantıyı Test Et
        </Button>
        <Button type="button" onClick={() => void migrate()} disabled={busy || !testResult?.ok}>
          Migrasyonları Çalıştır
        </Button>
      </div>

      {testResult && <StatusBanner ok={testResult.ok} message={testResult.message} />}
      {migrateResult && <StatusBanner ok={migrateResult.ok} message={migrateResult.message} />}

      <div className="mt-4 flex justify-end">
        <Button type="button" onClick={onDone} disabled={!migrateResult?.ok}>
          İleri
        </Button>
      </div>
    </div>
  );
}
