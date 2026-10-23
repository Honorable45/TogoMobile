/**
 * Identité de la plateforme — point unique de configuration.
 * Modifier ce fichier (et les couleurs dans globals.css) suffit pour changer de nom ou de charte.
 * Aucune certification, agrément ou partenariat de marque n'est revendiqué.
 */
export const brand = {
  name: 'TogoMobile',
  shortName: 'TogoMobile',
  tagline: 'Les téléphones des boutiques du Togo, au même endroit',
  /** Accroche de l'accueil (6 à 8 mots, 3 verbes). */
  motto: 'Comparer, choisir et commander en confiance',
  city: 'Lomé',
  /**
   * Photos facultatives (dans /public). Sans photo, l'accueil et les bandeaux utilisent un aplat bleu nuit.
   * Utiliser des photos réelles (boutiques, appareils sur fond neutre), jamais de photos de stock génériques.
   */
  heroImage: process.env.NEXT_PUBLIC_HERO_IMAGE || '',
  bannerImage: process.env.NEXT_PUBLIC_BANNER_IMAGE || '',
  /** WhatsApp officiel de la plateforme (support). Le bouton vert n'apparaît que s'il est renseigné. */
  whatsapp: process.env.NEXT_PUBLIC_PLATFORM_WHATSAPP || '',
  description:
    'Comparez les téléphones neufs, reconditionnés et d’occasion proposés par les boutiques du Togo, puis commandez directement auprès du vendeur sur WhatsApp.',
  country: 'Togo',
  locale: 'fr-TG',
  currency: 'XOF',
  timeZone: 'Africa/Lome',
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  /** Application d'administration, déployée séparément (dossier admin/). */
  adminUrl: (process.env.NEXT_PUBLIC_ADMIN_URL || 'http://localhost:3001').replace(/\/$/, ''),
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || '',
  /** Liens sociaux officiels : n'afficher que ceux qui existent réellement. */
  social: {
    facebook: process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK || '',
    instagram: process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM || '',
    tiktok: process.env.NEXT_PUBLIC_SOCIAL_TIKTOK || '',
  },
} as const;
