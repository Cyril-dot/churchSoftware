import { CHURCH_LOGO_DATA_URI } from '@/lib/church-logo';

/** Church logo for receipts — white-background version, prints cleanly on thermal paper. */
export default function ReceiptLogo({ className = '' }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={CHURCH_LOGO_DATA_URI}
      alt="Holy Hill Chapel — Assemblies of God"
      className={`mx-auto ${className}`}
      style={{ width: '148px', height: 'auto' }}
    />
  );
}
