'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { ExternalLink, ImagePlus } from 'lucide-react';
import { PageHeader, useSellerShop, type SellerShop } from '@/components/seller/seller-shell';
import { useSession } from '@/components/session';
import { ShopForm } from '@/components/shop/shop-form';
import { ShopLogo } from '@/components/shop/shop-card';
import { Button } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/misc';
import { api, errorMessage } from '@/lib/api-client';
import { formatDateTime, SHOP_STATUS_LABELS } from '@/lib/format';

export default function ShopProfilePage() {
  const { shop, setShop } = useSellerShop();
  const { notify, refresh } = useSession();
  const fileInput = useRef<HTMLInputElement>(null);
  const [logoState, setLogoState] = useState<{ loading?: boolean; error?: string }>({});
  const [toggling, setToggling] = useState(false);

  const uploadLogo = async (file?: File) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    setLogoState({ loading: true });
    try {
      setShop(await api<SellerShop>('/seller/shop/logo', { body: fd }));
      setLogoState({});
      notify('Logo mis à jour');
    } catch (e) {
      setLogoState({ error: errorMessage(e) });
    }
  };

  const toggleOpen = async () => {
    const closing = shop.status === 'ACTIVE';
    if (closing && !window.confirm('Fermer temporairement la boutique ? Vos annonces seront masquées jusqu’à la réouverture.')) return;
    setToggling(true);
    try {
      setShop(await api<SellerShop>(`/seller/shop/${closing ? 'close' : 'reopen'}`, { method: 'POST' }));
      notify(closing ? 'Boutique fermée temporairement' : 'Boutique rouverte');
    } catch (e) {
      notify(errorMessage(e), 'error');
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ma boutique"
        description={`Statut : ${SHOP_STATUS_LABELS[shop.status]}`}
        action={
          shop.publicUrlAvailable ? (
            <Link href={`/boutiques/${shop.slug}`} target="_blank" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
              Voir ma page publique <ExternalLink className="size-4" aria-hidden />
            </Link>
          ) : undefined
        }
      />

      {shop.pendingChanges && (
        <Alert tone="info" title="Modification en attente de validation">
          {shop.pendingChanges.name && <>Nouveau nom : « {shop.pendingChanges.name} ». </>}
          {shop.pendingChanges.whatsapp && <>Nouveau WhatsApp : {shop.pendingChanges.whatsapp}. </>}
          {shop.pendingChanges.requestedAt && <>Demandée le {formatDateTime(shop.pendingChanges.requestedAt)}.</>} Les anciennes informations restent affichées d’ici là.
        </Alert>
      )}

      <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-6">
        <ShopLogo src={shop.logoUrl} name={shop.name} size="lg" />
        <div className="flex-1 space-y-1">
          <p className="font-bold">Logo</p>
          <p className="text-sm text-muted">Image carrée de préférence (JPEG, PNG ou WebP). Elle est recadrée et optimisée automatiquement.</p>
          {logoState.error && <p className="text-sm text-danger" role="alert">{logoState.error}</p>}
        </div>
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" onChange={(e) => { void uploadLogo(e.target.files?.[0]); e.target.value = ''; }} />
        <Button variant="outline" loading={logoState.loading} disabled={shop.status === 'SUSPENDED'} onClick={() => fileInput.current?.click()}>
          <ImagePlus className="size-4" aria-hidden /> Changer le logo
        </Button>
      </Card>

      <Card className="p-4 sm:p-6">
        <fieldset disabled={shop.status === 'SUSPENDED'}>
          <ShopForm
            mode="update"
            sensitiveNotice={shop.status !== 'PENDING' && shop.status !== 'REJECTED'}
            initial={shop}
            onSaved={(s) => {
              setShop(s as SellerShop);
              void refresh();
            }}
          />
        </fieldset>
      </Card>

      {(shop.status === 'ACTIVE' || shop.status === 'CLOSED') && (
        <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-6">
          <div className="flex-1">
            <p className="font-bold">{shop.status === 'ACTIVE' ? 'Fermer temporairement' : 'Rouvrir la boutique'}</p>
            <p className="text-sm text-muted">
              {shop.status === 'ACTIVE' ? 'Pendant vos congés par exemple : vos annonces sont masquées, mais rien n’est supprimé.' : 'Vos annonces publiées redeviendront visibles immédiatement.'}
            </p>
          </div>
          <Button variant={shop.status === 'ACTIVE' ? 'outline' : 'primary'} loading={toggling} onClick={toggleOpen}>
            {shop.status === 'ACTIVE' ? 'Fermer temporairement' : 'Rouvrir'}
          </Button>
        </Card>
      )}
    </div>
  );
}
