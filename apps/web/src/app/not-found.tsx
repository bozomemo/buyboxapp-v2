import Link from 'next/link';
import { buttonClass, PageHeader } from '@/components/ui';

/**
 * The app's own 404 (review 2026-11-25): Next's default said "This page could not be found." in
 * English and outside the app's theme. It renders inside the root layout, so the menu stays and
 * the operator has somewhere to go.
 */
export default function NotFound() {
  return (
    <div className="mx-auto mt-16 max-w-md space-y-4">
      <PageHeader
        title="Sayfa bulunamadı"
        description="Açmak istediğiniz adres bu uygulamada yok (404). Bağlantı eski ya da eksik olabilir."
      />
      <Link href="/" className={buttonClass('primary', 'md')}>
        Panele dön
      </Link>
    </div>
  );
}
