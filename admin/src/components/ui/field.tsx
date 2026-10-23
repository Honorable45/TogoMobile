import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

const control =
  'w-full rounded-xl border border-line-2 bg-surface px-3.5 text-[0.9375rem] text-ink placeholder:text-faint transition-colors hover:border-muted focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-50 disabled:bg-paper-2 aria-[invalid=true]:border-danger';

interface FieldProps {
  label: string;
  error?: string;
  hint?: ReactNode;
  optional?: boolean;
  children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode;
  className?: string;
}

/** Champ de formulaire accessible : libellé associé, aide et message d'erreur annoncés. */
export function Field({ label, error, hint, optional, children, className = '' }: FieldProps) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={id} className="block text-[13px] font-medium text-ink">
        {label}
        {optional && <span className="ml-1 font-normal text-faint">facultatif</span>}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-[12.5px] leading-snug text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className = '', ...rest }, ref) {
  return <input ref={ref} className={`${control} h-11 ${className}`} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className = '', ...rest }, ref) {
  return <textarea ref={ref} className={`${control} min-h-24 py-2.5 ${className}`} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className = '', ...rest }, ref) {
  return <select ref={ref} className={`${control} h-11 pr-8 ${className}`} {...rest} />;
});

export function Checkbox({ label, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-ink">
      <input type="checkbox" className="size-4 rounded border-line-2 accent-navy" {...rest} />
      <span>{label}</span>
    </label>
  );
}
