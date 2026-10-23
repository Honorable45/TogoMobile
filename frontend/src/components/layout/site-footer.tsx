import Link from 'next/link';
import { brand } from '@/config/brand';
import { FacebookIcon, InstagramIcon, TikTokIcon, WhatsAppIcon } from '../ui/brand-icons';
import { Logo } from './logo';

/** Pied de page bleu nuit : identité et réseaux, liens, informations. */
export function SiteFooter() {
  const cols = [
    {
      title: 'Explorer',
      links: [
        { href: '/catalogue', label: 'Catalogue' },
        { href: '/boutiques', label: 'Boutiques' },
        { href: '/promotions', label: 'Promotions' },
        { href: '/comment-ca-marche', label: 'Comment ça marche' },
      ],
    },
    {
      title: 'Vendeurs et informations',
      links: [
        { href: '/connexion', label: 'Se connecter' },
        { href: '/devenir-vendeur', label: 'Devenir vendeur' },
        { href: '/vendeur', label: 'Espace vendeur' },
        { href: '/moderation', label: 'Modération et avis vérifiés' },
        { href: '/contact', label: 'Contact' },
      ],
    },
  ];
  const social = [
    { href: brand.social.facebook, label: 'Facebook', Icon: FacebookIcon },
    { href: brand.social.instagram, label: 'Instagram', Icon: InstagramIcon },
    { href: brand.social.tiktok, label: 'TikTok', Icon: TikTokIcon },
    { href: brand.whatsapp ? `https://wa.me/${brand.whatsapp.replace(/\D/g, '')}` : '', label: 'WhatsApp', Icon: WhatsAppIcon },
  ].filter((s) => s.href);

  return (
    <footer className="mt-16 bg-navy text-[#f5f3ee]/85 md:mt-24">
      <div className="container-page grid gap-10 py-14 md:grid-cols-[1.3fr_1fr_1fr]">
        <div className="max-w-xs">
          <Logo inverted />
          <p className="mt-4 text-sm leading-relaxed">
            Les boutiques de téléphones du {brand.country} réunies en un catalogue. Vente et paiement se concluent directement avec le vendeur.
          </p>
          {social.length > 0 && (
            <div className="mt-5 flex gap-2">
              {social.map((s) => (
                <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label} className="glass inline-flex size-11 items-center justify-center rounded-full text-white">
                  <s.Icon className="size-[18px]" />
                </a>
              ))}
            </div>
          )}
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <h2 className="eyebrow text-white/60">{c.title}</h2>
            <ul className="mt-4 space-y-1">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} prefetch={l.href.startsWith('/vendeur') ? false : undefined} className="inline-flex min-h-9 items-center text-sm hover:text-white hover:underline">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="container-page flex flex-col gap-2 py-6 text-[12.5px] text-white/50 sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} {brand.name} · Prix en francs CFA (FCFA), fixés par chaque vendeur.</p>
          <p className="flex gap-4">
            <Link href="/conditions" className="hover:text-white">Conditions</Link>
            <Link href="/confidentialite" className="hover:text-white">Confidentialité</Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
