/**
 * Normalisation des numéros de téléphone au format international E.164.
 * Indicatif par défaut : +228 (Togo). Les numéros togolais comportent 8 chiffres.
 */

export const DEFAULT_COUNTRY_CODE = '228';

export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;

  let digits = trimmed.replace(/[^\d+]/g, '');
  if (digits.startsWith('00')) digits = '+' + digits.slice(2);

  let international: string;
  if (digits.startsWith('+')) {
    international = digits.slice(1).replace(/\D/g, '');
  } else {
    const local = digits.replace(/\D/g, '');
    // Numéro local togolais à 8 chiffres
    if (local.length === 8) international = DEFAULT_COUNTRY_CODE + local;
    else if (local.startsWith(DEFAULT_COUNTRY_CODE) && local.length === 11) international = local;
    else return null;
  }

  if (international.length < 8 || international.length > 15) return null;
  if (international.startsWith('0')) return null;
  if (international.startsWith(DEFAULT_COUNTRY_CODE) && international.length !== 11) return null;
  return '+' + international;
}

export function isValidPhone(input: string | null | undefined): boolean {
  return normalizePhone(input) !== null;
}

/** Numéro au format attendu par wa.me : chiffres uniquement, sans « + » ni espaces. */
export function whatsappDigits(e164: string): string {
  return e164.replace(/\D/g, '');
}

export function buildWhatsappUrl(e164: string, message: string): string {
  return `https://wa.me/${whatsappDigits(e164)}?text=${encodeURIComponent(message)}`;
}
