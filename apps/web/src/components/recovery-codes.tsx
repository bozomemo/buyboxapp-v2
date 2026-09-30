'use client';

import { useState } from 'react';
import { Button } from './ui';

/**
 * Ten recovery codes, shown **once** (doc 18 §5.4). The only copy the user will ever have — the
 * server keeps hashes — so the screen says so, and offers copy and download before it lets go.
 */
export function RecoveryCodes({ codes, onDone }: { codes: readonly string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const text = codes.join('\n');

  function download() {
    const blob = new Blob([`BuyBox kurtarma kodları\n\n${text}\n\nHer kod bir kez kullanılabilir.\n`], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'buybox-kurtarma-kodlari.txt';
    a.click();
    URL.revokeObjectURL(url);
    setSaved(true);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        Telefonunuza erişemezseniz bu kodlarla giriş yapabilirsiniz. Her biri <strong>bir kez</strong> kullanılabilir.{' '}
        <strong>Bir daha gösterilmeyecekler</strong> — güvenli bir yere kaydedin.
      </p>
      <ol className="grid grid-cols-2 gap-x-6 gap-y-1 rounded border border-(--color-border) bg-(--color-chip-bg) p-3 font-mono text-sm">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            void navigator.clipboard?.writeText(text).then(() => setSaved(true));
          }}
        >
          Kopyala
        </Button>
        <Button type="button" variant="secondary" onClick={download}>
          İndir (.txt)
        </Button>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        Kodları güvenli bir yere kaydettim
      </label>
      <Button type="button" disabled={!saved} onClick={onDone}>
        Tamam
      </Button>
    </div>
  );
}
