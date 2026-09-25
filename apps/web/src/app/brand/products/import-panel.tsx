'use client';

/**
 * Stok (marka) → _Excel'den yükle_ (doc 17 §3.5).
 *
 * Two steps, and the first writes nothing. The preview says in numbers what the file will do and
 * lists every problem row with its line, its column and what is wrong; only then does a second,
 * explicit press write anything. That is the whole design: this import accepts a file with bad
 * rows in it — a brand's list is thousands of products and forty typos — and the confirmation is
 * what keeps "2.960 of 3.000" from being a silent partial import. The forty rows come back as a
 * file with a `Hata` column so they can be fixed and re-uploaded on their own.
 */

import { useRef, useState } from 'react';
import { Button, Field, Section, StatusBanner } from '@/components/ui';
import { STICKY_HEAD, TableFrame } from '@/components/table';
import { downloadCsv } from '@/lib/csv';
import { formatNumber } from '@/lib/format';
import { IMPORT_COLUMN_LABELS, IMPORT_WARNING_LABELS, importErrorMessage } from '@/lib/labels';

interface RowProblem {
  line: number;
  errors: { code: string; column?: string; otherProductName?: string }[];
}

interface RowWarning {
  line: number;
  name: string;
  warnings: string[];
}

interface Summary {
  totalRows: number;
  newProducts: number;
  updatedProducts: number;
  cardsToCreate: number;
  linksToAttach: number;
  errorRows: number;
}

interface Applied {
  newProducts: number;
  updatedProducts: number;
  linkedCards: number;
  createdCards: number;
  skippedRows: number;
}

interface ImportResponse {
  ok?: boolean;
  preview?: boolean;
  summary?: Summary;
  problems?: RowProblem[];
  warnings?: RowWarning[];
  applied?: Applied;
  error?: string;
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function ImportPanel({ onImported }: { onImported: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [problems, setProblems] = useState<RowProblem[]>([]);
  const [warnings, setWarnings] = useState<RowWarning[]>([]);
  /** The file the preview was computed from, so Confirm cannot apply a different one. */
  const [staged, setStaged] = useState<{ base64: string; name: string } | null>(null);

  async function send(confirm: boolean) {
    const file = confirm ? null : (fileInput.current?.files?.[0] ?? null);
    if (!confirm && !file) {
      setError('Önce bir dosya seçin.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const payload = confirm ? staged : { base64: await fileToBase64(file!), name: file!.name };
      if (!payload) {
        setError('Önizleme kayboldu, dosyayı yeniden seçin.');
        return;
      }
      const res = await fetch('/api/brand-products/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileBase64: payload.base64, fileName: payload.name, confirm }),
      });
      const data = (await res.json()) as ImportResponse;
      if (!res.ok) {
        setError(data.error ?? 'Dosya okunamadı.');
        setSummary(null);
        setProblems([]);
        setWarnings([]);
        return;
      }
      setSummary(data.summary ?? null);
      setProblems(data.problems ?? []);
      setWarnings(data.warnings ?? []);
      if (confirm) {
        const applied = data.applied!;
        setNotice(
          `${formatNumber(applied.newProducts)} yeni ürün, ${formatNumber(applied.updatedProducts)} güncelleme, ` +
            `${formatNumber(applied.linkedCards)} kart bağlandı (${formatNumber(applied.createdCards)} yeni kart)` +
            (applied.skippedRows > 0 ? ` · ${formatNumber(applied.skippedRows)} satır alınmadı` : ''),
        );
        setStaged(null);
        if (fileInput.current) fileInput.current.value = '';
        onImported();
      } else {
        setStaged(payload);
      }
    } finally {
      setBusy(false);
    }
  }

  /** The invalid rows, as a file with the reason added — doc 17 §3.5's "fix these and re-upload". */
  function downloadProblems() {
    downloadCsv(
      'iceri-alinmayan-satirlar.csv',
      problems.flatMap((problem) =>
        problem.errors.map((error) => ({
          Satır: problem.line,
          Sütun: error.column ? (IMPORT_COLUMN_LABELS[error.column] ?? error.column) : '',
          Hata: importErrorMessage(error),
        })),
      ),
    );
  }

  return (
    <Section
      id="brand-import"
      title="Excel'den yükle"
      action={
        <a className="text-sm underline" href="/api/brand-products/import" download>
          Şablon indir
        </a>
      }
    >
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Dosya" hint=".xlsx veya .csv">
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.csv,text/csv"
            onChange={() => {
              // A new file invalidates the preview: confirming after swapping the file would
              // apply numbers the operator never saw.
              setStaged(null);
              setSummary(null);
              setProblems([]);
              setWarnings([]);
              setNotice(null);
            }}
            className="w-80 rounded border border-(--color-border) px-2 py-1 text-sm"
          />
        </Field>
        <Button variant="secondary" type="button" disabled={busy} onClick={() => void send(false)}>
          {busy ? 'Okunuyor…' : 'Önizle'}
        </Button>
        {summary && staged && summary.totalRows - summary.errorRows > 0 && (
          <Button type="button" disabled={busy} onClick={() => void send(true)}>
            Geçerli {formatNumber(summary.totalRows - summary.errorRows)} satırı içe aktar
          </Button>
        )}
      </div>

      <p className="mt-2 max-w-3xl text-xs text-(--color-muted)">
        Sütunlar: <strong>Ürün Adı</strong>, <strong>PSF</strong>, Min Fiyat, Max Fiyat,{' '}
        <strong>Trendyol Linki</strong> ya da <strong>Hepsiburada Linki</strong> (en az biri), Barkod.
        Fiyatlar <em>birim başına</em>dır. Dolu bir hücre yazar, <em>boş bir hücre siler</em> — boş bir Min
        Fiyat, daha önce girilmiş min&apos;i kaldırır. Boş bir link sütunu ise hiçbir şeyi değiştirmez: link,
        satırın hangi ürün olduğunu bulmaya yarar; kart çıkarma ürün ekranından yapılır.
      </p>

      {error && (
        <div className="mt-2">
          <StatusBanner ok={false} message={error} />
        </div>
      )}
      {notice && (
        <div className="mt-2">
          <StatusBanner ok message={notice} />
        </div>
      )}

      {summary && (
        <div className="mt-3 flex flex-wrap gap-4 rounded border border-(--color-border) p-3 text-sm">
          <span>
            Toplam <strong>{formatNumber(summary.totalRows)}</strong> satır
          </span>
          <span>
            Yeni ürün <strong>{formatNumber(summary.newProducts)}</strong>
          </span>
          <span>
            Güncellenecek <strong>{formatNumber(summary.updatedProducts)}</strong>
          </span>
          <span>
            Bağlanacak kart <strong>{formatNumber(summary.linksToAttach)}</strong>
            {summary.cardsToCreate > 0 && (
              <span className="text-(--color-muted)">
                {' '}
                ({formatNumber(summary.cardsToCreate)} tanesi yeni takip edilecek)
              </span>
            )}
          </span>
          <span className={summary.errorRows > 0 ? 'text-(--color-warning)' : undefined}>
            Alınmayacak satır <strong>{formatNumber(summary.errorRows)}</strong>
          </span>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mt-3 text-sm">
          <p className="mb-1 font-medium">
            İçeri alınacak ama dikkat edilmesi gereken {formatNumber(warnings.length)} satır
          </p>
          <ul className="list-inside list-disc text-xs text-(--color-muted)">
            {warnings.slice(0, 10).map((warning) => (
              <li key={warning.line}>
                {warning.line}. satır — {warning.name}:{' '}
                {warning.warnings.map((code) => IMPORT_WARNING_LABELS[code] ?? code).join(' ')}
              </li>
            ))}
          </ul>
          {warnings.length > 10 && (
            <p className="mt-1 text-xs text-(--color-muted)">
              …ve {formatNumber(warnings.length - 10)} satır daha.
            </p>
          )}
        </div>
      )}

      {problems.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-sm font-medium text-(--color-warning)">
              {formatNumber(problems.length)} satır içeri alınmayacak
            </p>
            <Button
              variant="secondary"
              type="button"
              className="px-2! py-1! text-xs"
              onClick={downloadProblems}
            >
              Hatalı satırları indir
            </Button>
          </div>
          <TableFrame maxHeight="16rem">
            <table className="w-full text-xs">
              <thead className={STICKY_HEAD}>
                <tr className="text-left">
                  <th className="p-2">Satır</th>
                  <th className="p-2">Sütun</th>
                  <th className="p-2">Sorun</th>
                </tr>
              </thead>
              <tbody>
                {problems.flatMap((problem) =>
                  problem.errors.map((error, index) => (
                    <tr key={`${problem.line}-${index}`} className="border-t border-(--color-border)">
                      <td className="p-2 tabular-nums">{problem.line}</td>
                      <td className="p-2">
                        {error.column ? (IMPORT_COLUMN_LABELS[error.column] ?? error.column) : '—'}
                      </td>
                      <td className="p-2">{importErrorMessage(error)}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </TableFrame>
        </div>
      )}
    </Section>
  );
}
