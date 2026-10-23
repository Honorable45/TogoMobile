'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Flag, X } from 'lucide-react';
import { api, errorMessage } from '@/lib/api-client';
import { loginHref, useSession } from './session';
import { Button } from './ui/button';
import { Field, Select, Textarea } from './ui/field';
import { Alert } from './ui/misc';

const REASONS: Record<string, string> = {
  FRAUD: 'Arnaque ou fraude suspectée',
  MISLEADING: 'Information trompeuse (prix, état, caractéristiques)',
  COUNTERFEIT: 'Contrefaçon ou produit interdit',
  STOLEN: 'Appareil possiblement volé',
  FAKE_REVIEW: 'Avis faux ou non authentique',
  ABUSIVE: 'Contenu injurieux ou inapproprié',
  NOT_RECEIVED: 'Je conteste cette vente',
  OTHER: 'Autre motif',
};

export function ReportButton({ targetType, targetId, label = 'Signaler', compact }: { targetType: 'PRODUCT' | 'SHOP' | 'REVIEW' | 'PROMOTION'; targetId: string; label?: string; compact?: boolean }) {
  const { user } = useSession();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState(targetType === 'REVIEW' ? 'FAKE_REVIEW' : 'MISLEADING');
  const [details, setDetails] = useState('');
  const [state, setState] = useState<{ loading?: boolean; error?: string; done?: string }>({});

  const open = () => {
    if (!user) return router.push(loginHref());
    setState({});
    dialog.current?.showModal();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState({ loading: true });
    try {
      const r = await api<{ message: string }>('/reports', { body: { targetType, targetId, reason, details: details || null } });
      setState({ done: r.message });
    } catch (err) {
      setState({ error: errorMessage(err) });
    }
  };

  return (
    <>
      <button type="button" onClick={open} className={`inline-flex items-center gap-1.5 text-muted hover:text-ink ${compact ? 'text-xs' : 'text-sm'}`}>
        <Flag className={compact ? 'size-3.5' : 'size-4'} aria-hidden />
        {label}
      </button>
      <dialog ref={dialog} className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-2xl p-0 shadow-pop backdrop:bg-ink/50" aria-labelledby={`report-${targetId}`}>
        <form onSubmit={submit} className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-4">
            <h2 id={`report-${targetId}`} className="text-lg font-bold">
              Signaler ce contenu
            </h2>
            <button type="button" onClick={() => dialog.current?.close()} className="inline-flex size-9 items-center justify-center rounded-lg hover:bg-canvas" aria-label="Fermer">
              <X className="size-5" />
            </button>
          </div>
          {state.done ? (
            <Alert tone="success">{state.done}</Alert>
          ) : (
            <>
              <Field label="Motif">
                {(p) => (
                  <Select {...p} value={reason} onChange={(e) => setReason(e.target.value)}>
                    {Object.entries(REASONS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Précisions" optional hint="Décrivez ce qui vous semble anormal. N’indiquez pas de données personnelles sensibles.">
                {(p) => <Textarea {...p} value={details} maxLength={1000} onChange={(e) => setDetails(e.target.value)} />}
              </Field>
              {state.error && <Alert tone="danger">{state.error}</Alert>}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => dialog.current?.close()}>
                  Annuler
                </Button>
                <Button type="submit" loading={state.loading}>
                  Envoyer le signalement
                </Button>
              </div>
            </>
          )}
        </form>
      </dialog>
    </>
  );
}
