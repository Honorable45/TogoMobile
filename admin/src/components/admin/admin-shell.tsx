'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { BarChart3, Flag, Layers, Receipt, ScrollText, Smartphone, Star, Store, Tag, Users } from 'lucide-react';
import { useRequireUser } from '@/lib/hooks';
import { Button } from '../ui/button';
import { Field, Textarea } from '../ui/field';
import { Skeleton } from '../ui/misc';

const NAV = [
  { href: '/', label: 'Statistiques', icon: BarChart3, exact: true },
  { href: '/boutiques', label: 'Boutiques', icon: Store },
  { href: '/produits', label: 'Annonces', icon: Smartphone },
  { href: '/promotions', label: 'Promotions', icon: Tag },
  { href: '/avis', label: 'Avis', icon: Star },
  { href: '/ventes', label: 'Ventes déclarées', icon: Receipt },
  { href: '/signalements', label: 'Signalements', icon: Flag },
  { href: '/utilisateurs', label: 'Comptes', icon: Users },
  { href: '/referentiels', label: 'Marques et catégories', icon: Layers },
  { href: '/journal', label: 'Journal d’audit', icon: ScrollText },
];

interface DecisionOptions {
  title: string;
  description?: string;
  confirmLabel: string;
  danger?: boolean;
  reason?: 'required' | 'optional' | 'none';
  reasonLabel?: string;
}

const DecisionCtx = createContext<(o: DecisionOptions) => Promise<{ reason?: string } | null>>(async () => null);
/** Confirmation des opérations sensibles, avec motif journalisé. */
export const useDecision = () => useContext(DecisionCtx);

function DecisionProvider({ children }: { children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [opts, setOpts] = useState<DecisionOptions | null>(null);
  const [reason, setReason] = useState('');
  const resolver = useRef<(v: { reason?: string } | null) => void>(undefined);

  const ask = useCallback((o: DecisionOptions) => {
    setOpts(o);
    setReason('');
    dialog.current?.showModal();
    return new Promise<{ reason?: string } | null>((r) => (resolver.current = r));
  }, []);

  const close = (v: { reason?: string } | null) => {
    resolver.current?.(v);
    dialog.current?.close();
  };

  const needReason = opts?.reason === 'required';
  return (
    <DecisionCtx.Provider value={ask}>
      {children}
      <dialog ref={dialog} onCancel={() => resolver.current?.(null)} className="m-auto w-[min(30rem,calc(100%-2rem))] rounded-2xl p-0 shadow-pop backdrop:bg-ink/50" aria-labelledby="decision-title">
        {opts && (
          <form
            className="space-y-4 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (needReason && reason.trim().length < 3) return;
              close({ reason: reason.trim() || undefined });
            }}
          >
            <h2 id="decision-title" className="text-lg font-bold">{opts.title}</h2>
            {opts.description && <p className="text-sm text-muted">{opts.description}</p>}
            {opts.reason !== 'none' && (
              <Field label={opts.reasonLabel ?? 'Motif'} optional={!needReason} hint="Conservé dans le journal d’audit.">
                {(p) => <Textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} minLength={needReason ? 3 : 0} maxLength={500} required={needReason} />}
              </Field>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => close(null)}>Annuler</Button>
              <Button type="submit" variant={opts.danger ? 'danger' : 'primary'} disabled={needReason && reason.trim().length < 3}>
                {opts.confirmLabel}
              </Button>
            </div>
          </form>
        )}
      </dialog>
    </DecisionCtx.Provider>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const { ready } = useRequireUser('ADMIN');
  const pathname = usePathname();
  if (!ready) {
    return (
      <div className="container-page grid gap-6 py-6 lg:grid-cols-[14rem_1fr]">
        <Skeleton className="hidden h-80 lg:block" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  return (
    <DecisionProvider>
      <div className="container-page grid grid-cols-[minmax(0,1fr)] gap-6 py-4 sm:py-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-8">
        <aside className="lg:sticky lg:top-20 lg:h-fit">
          <p className="eyebrow mb-3 hidden px-4 lg:block">Administration</p>
          <nav aria-label="Administration" className="scrollbar-none -mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
            <ul className="flex gap-1 lg:flex-col">
              {NAV.map((n) => {
                const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
                return (
                  <li key={n.href} className="shrink-0">
                    <Link
                      href={n.href}
                      aria-current={active ? 'page' : undefined}
                      className="flex h-11 items-center gap-2.5 rounded-full px-4 text-sm font-medium text-ink-2 transition-colors hover:bg-white aria-[current=page]:bg-navy aria-[current=page]:text-white"
                    >
                      <n.icon className="size-[18px]" aria-hidden />
                      {n.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>
        <div className="min-w-0 space-y-5">{children}</div>
      </div>
    </DecisionProvider>
  );
}

/** Barre de filtres d'une liste d'administration : onglets de statut + recherche facultative. */
export function FilterTabs({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Array<[string, string]> }) {
  return (
    <div role="tablist" className="scrollbar-none flex gap-1 overflow-x-auto">
      {options.map(([v, l]) => (
        <button key={v} role="tab" aria-selected={value === v} onClick={() => onChange(v)} className={`h-10 shrink-0 rounded-full px-4 text-sm font-medium ${value === v ? 'bg-navy text-white' : 'bg-surface text-ink-2 hover:bg-white'}`}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function Pager({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 text-sm">
      <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>← Précédent</Button>
      <span className="text-muted">Page {page} / {totalPages}</span>
      <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Suivant →</Button>
    </div>
  );
}
