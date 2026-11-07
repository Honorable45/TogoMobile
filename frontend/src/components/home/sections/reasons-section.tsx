import { brand } from '@/config/brand';
import { HOME_TITLES, REASONS } from '@/config/home-content';
import { ScrollRow } from '../scroll-row';
import { SectionHead } from './section-head';

/** « Pourquoi acheter ici » : cartes d'arguments (textes dans config/home-content.ts). */
export function ReasonsSection() {
  return (
    <section aria-labelledby="pourquoi" className="bg-canvas py-16 md:py-24">
      <SectionHead id="pourquoi" title={HOME_TITLES.reasons(brand.name)} href="/comment-ca-marche" link="Comment ça marche" />
      <ScrollRow label={`Pourquoi acheter sur ${brand.name}`}>
        {REASONS.map(({ Icon, tone, eyebrow, title, text }) => (
          <article
            key={eyebrow}
            className="flex h-[340px] w-[78vw] max-w-[320px] shrink-0 flex-col rounded-[28px] bg-surface p-7 transition-transform duration-300 hover:scale-[1.01] sm:w-[320px] md:h-[440px] md:p-8"
          >
            <p className="text-[13px] font-semibold text-ink-2">{eyebrow}</p>
            <h3 className="display mt-2 text-[26px]">{title}</h3>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{text}</p>
            <span className={`mt-auto flex size-20 items-center justify-center self-center rounded-[26px] md:size-28 md:rounded-[32px] ${tone}`}>
              <Icon className="size-12" strokeWidth={1.5} aria-hidden />
            </span>
          </article>
        ))}
      </ScrollRow>
    </section>
  );
}
