import Link from 'next/link';
import { forwardRef, type ButtonHTMLAttributes, type ComponentProps } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Boutons en pilule. Hiérarchie :
 * - primary  : verre sombre (action principale sur fond clair)
 * - glass    : verre clair (sur photo ou aplat bleu nuit)
 * - whatsapp : vert plein (canal de contact)
 * - outline  : verre clair ; secondary : accent pâle ; ghost ; danger
 */
export type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'glass' | 'whatsapp';
export type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-full font-medium select-none whitespace-nowrap transition-[transform,background-color,box-shadow,color] duration-200 ease-[cubic-bezier(0.2,0.7,0.2,1)] active:scale-[.98] disabled:opacity-55 disabled:pointer-events-none';
const variants: Record<Variant, string> = {
  primary: 'glass-dark text-white hover:-translate-y-0.5 hover:bg-navy',
  glass: 'glass text-white hover:-translate-y-0.5 hover:bg-white/20',
  whatsapp: 'bg-whatsapp text-white hover:-translate-y-0.5 hover:bg-whatsapp-hover',
  secondary: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
  outline: 'glass-light text-ink hover:-translate-y-0.5 hover:bg-white/80',
  ghost: 'text-ink-2 hover:bg-paper-2',
  danger: 'bg-danger text-white hover:bg-[#86281f]',
};
const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-11 px-5 text-[0.9375rem]',
  lg: 'h-14 px-6 text-base',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra = '') {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, className = '', children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className = '',
  ...rest
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}
