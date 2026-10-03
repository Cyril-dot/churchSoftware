import type { CSSProperties } from 'react';

interface IconProps {
  /** Material Symbols icon name, e.g. "payments", "add", "point_of_sale" */
  name: string;
  /** Font size in px */
  size?: number;
  className?: string;
  style?: CSSProperties;
  filled?: boolean;
  /** Accessible label; decorative by default (aria-hidden) */
  label?: string;
}

/**
 * Material Symbols (outlined) icon.
 * Renders a ligature span — requires the Material Symbols webfont.
 */
export default function Icon({ name, size = 24, className = '', style, filled = false, label }: IconProps) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{ fontSize: size, fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 24`, ...style }}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      {name}
    </span>
  );
}
