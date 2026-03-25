import nfevigiaLogo from '@/assets/NFeVigia-logo.svg';

export function NFeVigiaLogo({ height = 32, className = '' }: { height?: number; className?: string }) {
  return (
    <img
      src={nfevigiaLogo}
      alt="NFeVigia"
      style={{ height: `${height}px` }}
      className={`w-auto ${className}`}
    />
  );
}
