'use client';

import { useEffect, useState } from 'react';
import { Button, Field, StatusBanner, StepStopNotice, TextInput } from '@/components/ui';

type Engine = 'sqlite' | 'postgres' | 'mysql';

/**
 * Per-field validation (doc 15 §6, Phase 6: field-level over end-of-step). This is a client-side
 * hint only — the server (`/api/setup/database/test`) is still the actual authority on whether a
 * connection string works, and its own "mutlak bir yol olmalıdır" rule (see the module doc
 * comment below) already rejects a relative SQLite path outright. Catching the obvious case here
 * just saves the operator a round trip for a mistake they can see before they click anything.
 */
function connectionStringError(engine: Engine, value: string): string | undefined {
  if (value.trim() === '') return 'Bağlantı bilgisi gerekli.';
  if (engine === 'sqlite') {
    const path = value.replace(/^file:/, '');
    const looksAbsolute = /^[/\\]/.test(path) || /^[a-zA-Z]:[/\\]/.test(path);
    if (!looksAbsolute) {
      return "Mutlak bir yol olmalı (örn. C:\\BuyBox\\app.db) — göreli bir yol web ve worker'ın farklı dosyalar açmasına yol açar.";
    }
  } else if (!value.includes('://')) {
    return `Geçersiz görünüyor — beklenen biçim: ${engine}://kullanici:sifre@sunucu:port/veritabani`;
  }
  return undefined;
}

/**
 * SQLite deliberately has no compiled-in default: only the server knows where this deployment
 * keeps its data, and the value it suggests is absolute. The constant that used to live here
 * was `file:./data/app.db`, and that relative path is what split a real install's database in
 * two on 2026-08-24 — the web process and the embedded worker resolved it at different moments,
 * against different working directories, and each ran happily against its own file. The
 * suggestion now comes from `/api/setup/database/suggest`; the server refuses a relative SQLite
 * path outright.
 */
const DEFAULTS: Record<Exclude<Engine, 'sqlite'>, string> = {
  postgres: 'postgres://user:password@localhost:5432/buybox',
  mysql: 'mysql://user:password@localhost:3306/buybox',
};

export function Step1Database({ onDone }: { onDone: () => void }) {
  const [engine, setEngine] = useState<Engine>('sqlite');
  const [connectionString, setConnectionString] = useState('');
  const [suggestedSqlite, setSuggestedSqlite] = useState('');
  // True when the suggestion is the database this install is *already* using, rather than a
  // path derived for a deployment that has none yet. Worth saying out loud: an operator who
  // cannot tell the difference edits the value, and editing it here is what creates a second
  // database (see the suggest route's doc comment).
  const [suggestionIsConfigured, setSuggestionIsConfigured] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | undefined>();
  const [migrateResult, setMigrateResult] = useState<{ ok: boolean; message: string } | undefined>();
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const fieldError = touched ? connectionStringError(engine, connectionString) : undefined;

  // The SQLite suggestion is the server's to make — it is absolute, and only the server knows
  // this deployment's data directory. Until it arrives the field stays empty rather than
  // showing a placeholder value the operator might accept without reading.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/setup/database/suggest');
        const data = (await res.json()) as { sqlite: string; configured?: boolean };
        if (cancelled) return;
        setSuggestedSqlite(data.sqlite);
        setSuggestionIsConfigured(data.configured === true);
        setConnectionString((current) => (current === '' ? data.sqlite : current));
      } catch {
        // Leave the field empty; the operator can type a path and the server validates it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function defaultFor(next: Engine): string {
    return next === 'sqlite' ? suggestedSqlite : DEFAULTS[next];
  }

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
            setConnectionString(defaultFor(next));
            setTestResult(undefined);
            setMigrateResult(undefined);
          }}
          className="rounded border border-(--color-border) px-3 py-1.5 text-sm"
        >
          <option value="sqlite">SQLite (tek kullanıcılı yerel kurulum için önerilir)</option>
          <option value="postgres">PostgreSQL</option>
          <option value="mysql">MySQL</option>
        </select>
      </Field>

      <Field
        label="Bağlantı Bilgisi"
        error={fieldError}
        hint={
          engine === 'sqlite' && suggestionIsConfigured && connectionString === suggestedSqlite
            ? 'Bu, kurulumun hâlihazırda kullandığı veritabanıdır. Değiştirmeniz gerekmiyor — başka bir yol yazarsanız ikinci bir veritabanı oluşur ve servis yeniden başlatılana kadar worker eskisini kullanmaya devam eder.'
            : engine === 'sqlite'
              ? 'Mutlak bir yol olmalıdır. Göreli bir yol (örn. file:./data/app.db) uygulamanın web ve worker parçalarının farklı dosyalar açmasına yol açar; sunucu bunu reddeder.'
              : undefined
        }
      >
        <TextInput
          value={connectionString}
          onChange={(e) => setConnectionString(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder={defaultFor(engine)}
        />
      </Field>

      <div className="flex gap-2">
        <Button
          variant="secondary"
          type="button"
          onClick={() => {
            setTouched(true);
            if (!connectionStringError(engine, connectionString)) void testConnection();
          }}
          disabled={busy}
        >
          Bağlantıyı Test Et
        </Button>
        <Button type="button" onClick={() => void migrate()} disabled={busy || !testResult?.ok}>
          Migrasyonları Çalıştır
        </Button>
      </div>

      {testResult && <StatusBanner ok={testResult.ok} message={testResult.message} />}
      {migrateResult && <StatusBanner ok={migrateResult.ok} message={migrateResult.message} />}

      <StepStopNotice>
        Bu adımda ilerlemeden çıkarsanız hiçbir şey kaydedilmez; sihirbaza döndüğünüzde kaldığınız adımdan
        devam edersiniz ama veritabanı bağlantısını yeniden test edip migrasyonları tekrar çalıştırmanız
        gerekir — bu adım her zaman yeniden onaylanır, çünkü sonraki her adım gerçekten çalışan bir şemaya
        yazar.
      </StepStopNotice>

      <div className="mt-4 flex justify-end">
        <Button type="button" onClick={onDone} disabled={!migrateResult?.ok}>
          İleri
        </Button>
      </div>
    </div>
  );
}
