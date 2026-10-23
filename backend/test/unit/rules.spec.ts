import sharp from 'sharp';
import { buildWhatsappUrl, normalizePhone } from '../../src/common/phone';
import { buildSearchText, normalizeSearch, slugify } from '../../src/common/text';
import { sniff } from '../../src/media/media-processing';
import { discountPercent, promotionPhase, referencePrice, validatePromotion } from '../../src/promotions/promotion-rules';
import { evaluateSale } from '../../src/sales/sale-rules';
import { normalizeSocialUrl } from '../../src/shops/shop.dto';

describe('Numéros de téléphone', () => {
  it.each([
    ['+228 90 12 34 56', '+22890123456'],
    ['90123456', '+22890123456'],
    ['00228 90-12-34-56', '+22890123456'],
    ['22890123456', '+22890123456'],
    ['+33 6 12 34 56 78', '+33612345678'],
  ])('normalise %s en %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['123', '+228 901234', 'abc', '', '+228 9012345678'])('rejette %s', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });

  it('construit un lien wa.me avec des chiffres uniquement et un message encodé', () => {
    const url = buildWhatsappUrl('+22890123456', 'Bonjour & merci');
    expect(url).toBe('https://wa.me/22890123456?text=Bonjour%20%26%20merci');
  });
});

describe('Texte et recherche', () => {
  it('produit des slugs sans accents', () => {
    expect(slugify('Téléphones à touches !')).toBe('telephones-a-touches');
  });
  it('normalise casse, accents et espaces', () => {
    expect(normalizeSearch('  iPhone   13  Pró ')).toBe('iphone 13 pro');
  });
  it('indexe une forme compacte pour tolérer les espaces', () => {
    expect(buildSearchText(['Apple', 'iPhone 13'])).toContain('appleiphone13');
  });
});

describe('Règles de promotion', () => {
  const now = new Date('2026-06-01T10:00:00Z');
  const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000);

  it('calcule la réduction (exemple 100 000 → 85 000 = 15 %)', () => {
    expect(discountPercent(100000, 85000)).toBe(15);
  });
  it('arrondit la réduction à l’inférieur', () => {
    expect(discountPercent(100000, 66667)).toBe(33);
  });
  it('prend le plus bas prix des 30 derniers jours comme référence', () => {
    expect(referencePrice(120000, [100000, 115000])).toBe(100000);
    expect(referencePrice(90000, [100000])).toBe(90000);
  });
  it('accepte une promotion valide', () => {
    expect(validatePromotion({ promoPrice: 85000, startsAt: now, endsAt: inDays(7) }, 100000, { now, maxDays: 90 })).toEqual([]);
  });
  it.each([
    [0, 'positif'],
    [-5, 'positif'],
    [100000, 'inférieur'],
    [120000, 'inférieur'],
  ])('rejette le prix promotionnel %s', (price, word) => {
    const errors = validatePromotion({ promoPrice: price, startsAt: now, endsAt: inDays(7) }, 100000, { now, maxDays: 90 });
    expect(errors.join(' ')).toContain(word);
  });
  it('rejette une date de fin antérieure au début', () => {
    const errors = validatePromotion({ promoPrice: 80000, startsAt: inDays(5), endsAt: inDays(2) }, 100000, { now, maxDays: 90 });
    expect(errors.join(' ')).toContain('postérieure');
  });
  it('rejette une promotion antidatée ou trop longue', () => {
    expect(validatePromotion({ promoPrice: 80000, startsAt: inDays(-3), endsAt: inDays(2) }, 100000, { now, maxDays: 90 }).length).toBeGreaterThan(0);
    expect(validatePromotion({ promoPrice: 80000, startsAt: now, endsAt: inDays(120) }, 100000, { now, maxDays: 90 }).length).toBeGreaterThan(0);
  });
  it('déduit la phase des dates : programmée, en cours, terminée', () => {
    const p = { status: 'ACTIVE' as const, startsAt: inDays(1), endsAt: inDays(3) };
    expect(promotionPhase(p, now)).toBe('SCHEDULED');
    expect(promotionPhase(p, inDays(2))).toBe('RUNNING');
    expect(promotionPhase(p, inDays(3))).toBe('ENDED');
    expect(promotionPhase({ ...p, status: 'SUSPENDED' }, inDays(2))).toBe('SUSPENDED');
  });
});

describe('Détection du type réel des fichiers', () => {
  it('reconnaît un PNG même sans extension', async () => {
    const buf = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).png().toBuffer();
    expect(sniff(buf)).toEqual({ kind: 'image', mime: 'image/png' });
  });
  it('reconnaît un MP4 à sa signature ftyp', () => {
    const buf = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(16)]);
    expect(sniff(buf)).toMatchObject({ kind: 'video', mime: 'video/mp4' });
  });
  it('rejette un script déguisé en image', () => {
    expect(sniff(Buffer.from('<script>alert(1)</script> fake.jpg padding'))).toBeNull();
  });
});

describe('Liens des réseaux sociaux', () => {
  it('accepte un lien https du bon réseau', () => {
    expect(normalizeSocialUrl('facebook', 'https://www.facebook.com/maboutique')).toBe('https://www.facebook.com/maboutique');
  });
  it.each([
    ['facebook', 'javascript:alert(1)'],
    ['facebook', 'http://facebook.com/x'],
    ['instagram', 'https://evil.com/instagram.com'],
    ['tiktok', 'https://tiktok.com.evil.com/x'],
    ['website', 'https://user:pass@site.tg'],
  ])('rejette %s %s', (network, url) => {
    expect(normalizeSocialUrl(network, url)).toBeNull();
  });
});

describe('Contrôles automatiques des ventes', () => {
  const base = { buyerSalesSameShop: 0, phoneReuseSameShop: 0, shopConfirmedLast24h: 0, shopIsNew: false, shopConfirmedTotal: 0, duplicateComment: false };
  it('ne signale rien pour une vente ordinaire', () => {
    expect(evaluateSale({ ...base, comment: 'Très bon téléphone, merci.' })).toEqual([]);
  });
  it('signale un volume anormal et la réutilisation d’un numéro', () => {
    const codes = evaluateSale({ ...base, shopConfirmedLast24h: 12, phoneReuseSameShop: 3 }).map((f) => f.code);
    expect(codes).toEqual(expect.arrayContaining(['HIGH_VOLUME', 'PHONE_REUSED']));
  });
  it('met en modération un commentaire contenant un numéro ou un lien', () => {
    const flags = evaluateSale({ ...base, comment: 'Appelez le +228 90 11 22 33 pour des prix' });
    expect(flags).toEqual([expect.objectContaining({ code: 'COMMENT_CONTACT', scope: 'content' })]);
  });
});
