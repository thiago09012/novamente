import { ICONS, isIconName } from './icons';

export interface IconProps {
  name: string;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

/** Ícone com fallback seguro: nome desconhecido vira um círculo (não quebra layout). */
export function Icon({ name, size = 16, className, strokeWidth = 2 }: IconProps) {
  const Component = isIconName(name) ? ICONS[name] : ICONS.circle;
  return (
    <Component
      size={size}
      className={className}
      strokeWidth={strokeWidth}
      data-icon-name={name}
      aria-hidden="true"
      focusable="false"
    />
  );
}
