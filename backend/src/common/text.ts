/** Supprime les accents et met en minuscules. */
export function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function slugify(value: string, maxLength = 60): string {
  return fold(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
}

/** Normalisation pour la recherche : sans accents, minuscules, espaces simples. */
export function normalizeSearch(value: string): string {
  return fold(value)
    .replace(/[^a-z0-9+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Texte indexé d'un produit : forme normalisée + forme compacte (sans espaces),
 * pour que « iphone13 » trouve « iPhone 13 » et inversement.
 */
export function buildSearchText(parts: Array<string | number | null | undefined>): string {
  const normalized = normalizeSearch(parts.filter((p) => p !== null && p !== undefined && p !== '').join(' '));
  return `${normalized} | ${normalized.replace(/ /g, '')}`;
}

/** Échappe les caractères spéciaux de LIKE. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => '\\' + c);
}

/** Empreinte de comparaison d'un commentaire (détection des avis répétitifs). */
export function commentFingerprint(value: string): string {
  return normalizeSearch(value).replace(/ /g, '');
}
