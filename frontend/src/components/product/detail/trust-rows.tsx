import Link from 'next/link';
import { BadgeCheck, ChevronRight, MapPin, MessageCircle, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ProductDetail } from '@/lib/types';

/** Une ligne de confiance : icône, titre, précision, et flèche si elle mène quelque part. */
function TrustRow({ icon, title, detail, href }: { icon: ReactNode; title: string; detail: string; href?: string }) {
  const body = (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-brand-600">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-ink">{title}</span>
        <span className="block text-[13px] text-muted">{detail}</span>
      </span>
      {href && <ChevronRight className="size-5 shrink-0 text-subtle" aria-hidden />}
    </>
  );
  const cls = 'flex items-center gap-3 rounded-2xl bg-brand-50 px-4 py-3';
  return href ? (
    <Link href={href} className={`${cls} transition-colors hover:bg-brand-100`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/**
 * Rassurance sous le bouton Commander (façon « livraison / garantie / retours » des grands sites) :
 * uniquement ce qui est vrai pour cette annonce et cette boutique.
 */
export function TrustRows({ p }: { p: ProductDetail }) {
  const where = [p.shop.district, p.shop.city].filter(Boolean).join(', ');
  return (
    <div className="space-y-2">
      <TrustRow icon={<MapPin className="size-5" aria-hidden />} title={`Chez ${p.shop.name}`} detail={`${where} · retrait ou livraison à convenir avec la boutique`} href={`/boutiques/${p.shop.slug}`} />
      <TrustRow
        icon={<ShieldCheck className="size-5" aria-hidden />}
        title={p.warranty ? `Garantie ${p.warranty}` : 'Garantie à confirmer'}
        detail={p.warranty ? 'Garantie donnée par la boutique : demandez un reçu qui la mentionne.' : 'Demandez à la boutique quelle garantie elle propose avant de payer.'}
      />
      {p.shop.validatedAt && (
        <TrustRow
          icon={<BadgeCheck className="size-5" aria-hidden />}
          title="Boutique validée par l’équipe"
          detail={p.shop.identityVerified ? 'Identité du vendeur vérifiée.' : 'Boutique examinée avant d’apparaître sur le site.'}
          href="/moderation"
        />
      )}
      <TrustRow icon={<MessageCircle className="size-5" aria-hidden />} title="Commande sur WhatsApp" detail="Vous payez la boutique, après avoir vérifié l’appareil." href="/comment-ca-marche" />
    </div>
  );
}
