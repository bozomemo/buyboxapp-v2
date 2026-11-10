import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useConfirm } from './confirm-dialog';
import { ConfirmButton } from './ui';

afterEach(cleanup);

describe('ConfirmButton', () => {
  it('asks in an in-app dialog, never the browser popup, and acts on "Onayla"', () => {
    const browser = vi.spyOn(window, 'confirm');
    const done = vi.fn();
    render(
      <ConfirmButton requireConfirm confirmMessage="Silinsin mi?" onConfirmed={done}>
        Sil
      </ConfirmButton>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sil' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('Silinsin mi?');
    expect(done).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Onayla' }));
    return vi.waitFor(() => {
      expect(done).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(browser).not.toHaveBeenCalled();
    });
  });

  it('does nothing on "Vazgeç", on Escape, or on a backdrop click', async () => {
    const done = vi.fn();
    render(
      <ConfirmButton requireConfirm confirmMessage="Silinsin mi?" onConfirmed={done}>
        Sil
      </ConfirmButton>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sil' }));
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sil' }));
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await act(async () => {});
    expect(done).not.toHaveBeenCalled();
  });

  it('puts focus on the safe choice', () => {
    render(
      <ConfirmButton requireConfirm confirmMessage="Silinsin mi?" onConfirmed={() => {}}>
        Sil
      </ConfirmButton>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sil' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Vazgeç' }));
  });

  it('names the action and the danger when told to', () => {
    render(
      <ConfirmButton
        requireConfirm
        confirmMessage="Kural silinsin mi?"
        confirmTitle="Kuralı sil"
        confirmLabel="Sil"
        confirmTone="danger"
        onConfirmed={() => {}}
      >
        Kaldır
      </ConfirmButton>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Kaldır' }));
    expect(screen.getByRole('heading', { name: 'Kuralı sil' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sil' }).className).toContain('color-danger');
  });

  it('is one click in the safe direction', () => {
    const done = vi.fn();
    render(
      <ConfirmButton requireConfirm={false} confirmMessage="" onConfirmed={done}>
        Durdur
      </ConfirmButton>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Durdur' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    return vi.waitFor(() => expect(done).toHaveBeenCalledTimes(1));
  });
});

function NoticeHarness({ onDone }: { onDone: () => void }) {
  const { notify, dialog } = useConfirm();
  return (
    <>
      <button type="button" onClick={() => void notify({ message: 'Kuyruğa alındı.' }).then(onDone)}>
        Tara
      </button>
      {dialog}
    </>
  );
}

describe('useConfirm().notify', () => {
  it('shows a one-button notice that resolves on "Tamam"', async () => {
    const done = vi.fn();
    render(<NoticeHarness onDone={done} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tara' }));
    expect(screen.getByRole('dialog').textContent).toContain('Kuyruğa alındı.');
    expect(screen.queryByRole('button', { name: 'Vazgeç' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tamam' }));
    await vi.waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
