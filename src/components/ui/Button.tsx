import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-[var(--text-on-accent-button)] border border-transparent hover:brightness-110 active:brightness-95',
  secondary: 'bg-bg-raised text-text border border-border-strong hover:bg-bg-hover',
  ghost: 'bg-transparent text-text border border-transparent hover:bg-bg-hover',
  danger: 'bg-danger-bg text-danger border border-transparent hover:brightness-110',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-sm gap-2',
};

/** Botão com alvo de toque ≥ 44 px (md) e foco visível padrão. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, className = '', children, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={`inline-flex shrink-0 items-center justify-center rounded-[var(--radius)] font-medium transition-colors duration-[var(--dur-fast)] disabled:pointer-events-none disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});
