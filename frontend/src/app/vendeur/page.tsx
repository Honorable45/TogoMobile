'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ArrowRight, Plus, QrCode, Tag } from 'lucide-react';
import { DailyBars, fillDays } from '@/components/seller/daily-bars';
import { PageHeader, useSellerShop } from '@/components/seller/seller-shell';
import { ButtonLink } from '@/components/ui/button';
import { Alert, Skeleton, Stars } from '@/components/ui/misc';
import { rating } from '@/lib/format';
import { useApi } from '@/lib/hooks';

interface Dashboard {
  products: { active: number; unavailable: number; drafts: number; archived: number };
  activePromotions: number;
  views: number;
  whatsappClicks: number;
  favoritesReceived: number;
  sales: { declared: number; verified: number; pending: number; disputed: number };
  shop: { ratingAvg: number; ratingCount: number };
  last30Days: Array<{ day: string; views: number; whatsappClicks: number }>;
}

function Stat({ label, value, hint, href }: { label: string; value: React.ReactNode; hint?: string; href?: string }) {
  const body = (
    <>
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="display num mt-1 text-[32px]">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-subtle">{hint}</p>}
    </>
  );
  const cls = 'block rounded-card border border-line bg-surface p-4';
  return href ? <Link href={href} className={`${cls} hover:shadow-pop`}>{body}</Link> : <div className={cls}>{body}</div>;
}

function Welcome() {
  const params = useSearchParams();
  if (!params.get('bienvenue')) return null;
  return (
    <Alert tone="success" title="Demande envoyée">
      Votre boutique sera visible dès sa validation par l’équipe. En attendant, ajoutez vos premiers téléphones : ils seront prêts à être publiés.
    </Alert>
  );
}

export default function SellerDashboard() {
  const { shop } = useSellerShop();
  const { data, error } = useApi<Dashboard>('/seller/dashboard');

  return (
    <div className="space-y-6">
      <Suspense>
        <Welcome />
      </Suspense>
      <PageHeader
        title={`Bonjour, ${shop.name}`}
        description="Vue d’ensemble de votre activité sur la plateforme."
        action={
          <ButtonLink href="/vendeur/produits/nouveau">
            <Plus className="size-4" aria-hidden /> Ajouter un téléphone
          </ButtonLink>
        }
      />
      {error && <Alert tone="danger">{error}</Alert>}
      {!data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : (
        <>
          <section aria-label="Annonces">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Annonces disponibles" value={data.products.active} href="/vendeur/produits?status=PUBLISHED" />
              <Stat label="Annonces indisponibles" value={data.products.unavailable} hint="Rupture, indisponible ou retiré" href="/vendeur/produits?status=PUBLISHED" />
              <Stat label="Brouillons" value={data.products.drafts} href="/vendeur/produits?status=DRAFT" />
              <Stat label="Promotions en cours" value={data.activePromotions} href="/vendeur/promotions" />
            </div>
          </section>

          <section aria-labelledby="audience" className="space-y-3">
            <h2 id="audience" className="display text-2xl">Audience</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Consultations" value={data.views.toLocaleString('fr-FR')} hint="Pages vues, pas des visiteurs uniques" />
              <Stat label="Clics vers WhatsApp" value={data.whatsappClicks.toLocaleString('fr-FR')} hint="Un clic n’est pas une vente" />
              <Stat label="Mises en favori" value={data.favoritesReceived.toLocaleString('fr-FR')} />
              <Stat
                label="Note de la boutique"
                value={data.shop.ratingCount ? <span className="flex items-center gap-2">{rating(data.shop.ratingAvg)} <Stars value={data.shop.ratingAvg} /></span> : '—'}
                hint={data.shop.ratingCount ? `${data.shop.ratingCount} avis publiés` : 'Aucun avis publié'}
                href="/vendeur/avis"
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <DailyBars title="Consultations par jour" unit="consultations" data={fillDays(data.last30Days, (d) => d.views)} />
              <DailyBars title="Clics WhatsApp par jour" unit="clics" data={fillDays(data.last30Days, (d) => d.whatsappClicks)} />
            </div>
          </section>

          <section aria-labelledby="ventes" className="space-y-3">
            <h2 id="ventes" className="display text-2xl">Ventes enregistrées</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Ventes déclarées" value={data.sales.declared} hint="Saisies par vous" href="/vendeur/ventes" />
              <Stat label="Vérifiées selon la procédure" value={data.sales.verified} hint="Confirmées par le client" href="/vendeur/ventes?status=VERIFIED" />
              <Stat label="En attente" value={data.sales.pending} hint="Client ou contrôle à venir" href="/vendeur/ventes" />
              <Stat label="Contestées" value={data.sales.disputed} href="/vendeur/ventes?status=DISPUTED" />
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-3">
            {[
              { href: '/vendeur/produits/nouveau', Icon: Plus, title: 'Publier un téléphone', text: 'Photos, prix et caractéristiques en quelques étapes.' },
              { href: '/vendeur/promotions', Icon: Tag, title: 'Créer une promotion', text: 'Une offre datée, mise en avant sur votre page.' },
              { href: '/vendeur/ventes', Icon: QrCode, title: 'Enregistrer une vente', text: 'Générez le QR code d’avis pour votre client.' },
            ].map(({ href, Icon, title, text }) => (
              <Link key={href} href={href} className="group flex gap-3 lift rounded-card border border-line bg-surface p-4 hover:shadow-card">
                <Icon className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 text-sm font-bold">{title} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden /></p>
                  <p className="text-xs text-muted">{text}</p>
                </div>
              </Link>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
