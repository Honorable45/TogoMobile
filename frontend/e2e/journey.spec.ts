import { expect, test, type Browser, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';

/**
 * Parcours complet (cahier des charges, phase 6) :
 * inscription vendeur → validation admin → produit → publication → catalogue → boutique → promotion →
 * favoris → vente déclarée → QR code → avis vérifié → contrôle par l'administration.
 */
test.describe.configure({ mode: 'serial' });

const run = Date.now().toString(36);
const PASSWORD = 'Parcours2026x';
const SHOP = `Boutique Parcours ${run}`;
const MODEL = `Galaxy Parcours ${run}`;
const SELLER_WA = `9${String(Date.now()).slice(-7)}`;
const BUYER_PHONE = `7${String(Date.now() + 7).slice(-7)}`;
// PNG 1×1 valide : le serveur le décode, le convertit en WebP et génère la vignette.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');

/** Application d'administration (dossier admin/), servie séparément. */
const ADMIN = (process.env.E2E_ADMIN_URL || 'http://localhost:3001').replace(/\/$/, '');

/** PNG uni (RGB) de la taille voulue, sans dépendance : assez grand pour une image de fond d'accueil. */
function solidPng(width: number, height: number, [r, g, b]: [number, number, number]) {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8 bits, RVB, sans entrelacement
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set([r, g, b], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

let seller: Page;
let admin: Page;
let buyer: Page;
let productUrl = '';
let reviewToken = '';

async function newPage(browser: Browser) {
  const ctx = await browser.newContext({ locale: 'fr-FR', timezoneId: 'Africa/Lome' });
  return ctx.newPage();
}

async function register(page: Page, name: string, email: string, phone?: string) {
  await page.goto('/inscription');
  await page.getByLabel('Nom complet').fill(name);
  await page.getByLabel('Adresse e-mail').fill(email);
  if (phone) await page.getByLabel('Numéro de téléphone').fill(phone);
  await page.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/inscription'));
}

test.beforeAll(async ({ browser }) => {
  seller = await newPage(browser);
  admin = await newPage(browser);
  buyer = await newPage(browser);
});

test('1. un vendeur s’inscrit et demande l’ouverture de sa boutique', async () => {
  await register(seller, 'Vendeur Parcours', `vendeur-${run}@test.togomobile`);
  await seller.goto('/devenir-vendeur');
  await seller.getByLabel('Nom commercial').fill(SHOP);
  await seller.getByLabel('Quartier').fill('Bè');
  await seller.getByLabel('Numéro WhatsApp professionnel').fill(SELLER_WA);
  await seller.getByLabel('Facebook').fill('https://www.facebook.com/boutique-parcours');
  await seller.getByRole('button', { name: 'Envoyer ma demande' }).click();
  await seller.waitForURL(/\/vendeur/);
  await expect(seller.getByText('Votre boutique est en attente de validation')).toBeVisible();
});

test('2. l’administration valide la boutique', async () => {
  const { email, password } = JSON.parse(readFileSync(join(__dirname, '.admin.json'), 'utf8'));
  await admin.goto(`${ADMIN}/connexion`);
  await admin.getByLabel('E-mail ou numéro de téléphone').fill(email);
  await admin.getByLabel('Mot de passe', { exact: true }).fill(password);
  await admin.getByRole('button', { name: 'Se connecter' }).click();
  await admin.waitForURL((u) => u.href.startsWith(ADMIN) && !u.pathname.startsWith('/connexion'));
  await admin.goto(`${ADMIN}/boutiques`);
  const card = admin.getByRole('listitem').filter({ hasText: SHOP });
  await card.getByRole('button', { name: 'Valider la boutique' }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Valider' }).click();
  await expect(admin.getByText('Boutique : valider — fait')).toBeVisible();
});

test('3-4. le vendeur crée un produit en étapes, ajoute une photo et le publie', async () => {
  await seller.goto('/vendeur/produits/nouveau');
  await seller.getByLabel('Marque').selectOption({ label: 'Samsung' });
  await seller.getByLabel('Modèle').fill(MODEL);
  await seller.getByLabel('État').selectOption({ label: 'Neuf' });
  await seller.getByLabel('Garantie').fill('12 mois');
  await seller.getByRole('button', { name: /Continuer/ }).click();
  await seller.getByLabel('Stockage').selectOption({ label: '256 Go' });
  await seller.getByLabel('Écran').fill('6,5 pouces AMOLED');
  await seller.getByRole('button', { name: /Continuer/ }).click();
  // Erreur de validation : la saisie précédente n'est pas perdue.
  await seller.getByRole('button', { name: /Enregistrer et ajouter les photos/ }).click();
  await expect(seller.getByText('Indiquez un prix en FCFA')).toBeVisible();
  await seller.getByLabel('Prix habituel (FCFA)').fill('150000');
  await seller.getByLabel('Quantité en stock').fill('2');
  await seller.getByRole('button', { name: /Enregistrer et ajouter les photos/ }).click();
  await expect(seller.getByRole('heading', { name: 'Photos et vidéo' })).toBeVisible();
  await seller.locator('input[type=file][multiple]').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PNG });
  await expect(seller.getByText('Principale')).toBeVisible();
  // Traitement asynchrone : la photo apparaît une fois ses variantes générées.
  await expect(seller.getByRole('img', { name: 'Photo 1' })).toBeVisible({ timeout: 20_000 });
  await seller.getByRole('button', { name: /Continuer/ }).click();
  await seller.getByRole('button', { name: 'Publier l’annonce' }).click();
  await seller.waitForURL(/\/vendeur\/produits$/);
  // La validation de la boutique n'approuve pas ses annonces : l'administration valide l'annonce.
  await expect(seller.getByRole('listitem').filter({ hasText: MODEL }).getByText('En attente de validation')).toBeVisible();
  await admin.goto(`${ADMIN}/produits`);
  const pending = admin.getByRole('listitem').filter({ hasText: MODEL });
  await pending.getByRole('button', { name: 'Approuver' }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Approuver' }).click();
  await expect(admin.getByText('Annonce approuvée')).toBeVisible();
  await seller.reload();
  await expect(seller.getByRole('listitem').filter({ hasText: MODEL }).getByText('Publiée')).toBeVisible();
});

test('5-6. l’annonce apparaît dans le catalogue et sur la page de la boutique', async ({ page }) => {
  await page.goto(`/catalogue?q=${encodeURIComponent(MODEL)}`);
  const link = page.getByRole('link', { name: new RegExp(MODEL) });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(MODEL);
  await expect(page.getByText('6,5 pouces AMOLED')).toBeVisible();
  productUrl = new URL(page.url()).pathname;
  await page.getByRole('link', { name: new RegExp(SHOP) }).click();
  await expect(page.getByRole('heading', { level: 1, name: SHOP })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(MODEL) })).toBeVisible();
});

test('7-8. le vendeur crée une promotion, affichée avec le même prix partout', async ({ page }) => {
  await seller.goto('/vendeur/promotions');
  await seller.getByRole('button', { name: 'Nouvelle promotion' }).click();
  await seller.getByLabel('Produit').selectOption({ label: `Samsung ${MODEL} 256 Go — 150 000 FCFA` });
  await seller.getByLabel('Prix promotionnel (FCFA)').fill('135000');
  await expect(seller.getByText('Réduction affichée : −10 %')).toBeVisible();
  await seller.getByRole('button', { name: 'Créer la promotion' }).click();
  await expect(seller.getByRole('listitem').filter({ hasText: MODEL }).getByText('En cours')).toBeVisible();

  await page.goto(productUrl);
  await expect(page.getByText('Promotion −10 %')).toBeVisible();
  await expect(page.getByText(/135\s000\s?FCFA/).first()).toBeVisible();
  await page.goto(`/catalogue?q=${encodeURIComponent(MODEL)}`);
  await expect(page.locator('article').getByText(/135\s000\s?FCFA/).first()).toBeVisible();
  await expect(page.locator('article').getByText('−10 %').first()).toBeVisible();
});

test('9. un client ajoute le produit et la boutique à ses favoris', async () => {
  await register(buyer, 'Ama Parcours', `client-${run}@test.togomobile`);
  await buyer.goto(productUrl);
  await buyer.getByRole('button', { name: `Ajouter Samsung ${MODEL} 256 Go aux favoris` }).first().click();
  await expect(buyer.getByText('Ajouté à vos favoris')).toBeVisible();
  await buyer.getByRole('link', { name: new RegExp(SHOP) }).click();
  await buyer.getByRole('button', { name: `Suivre ${SHOP}` }).click();
  await expect(buyer.getByRole('button', { name: `Ne plus suivre ${SHOP}` })).toBeVisible();
  await buyer.goto('/favoris');
  await expect(buyer.getByRole('link', { name: new RegExp(MODEL) })).toBeVisible();
  await buyer.getByRole('tab', { name: /Boutiques suivies/ }).click();
  await expect(buyer.getByRole('link', { name: SHOP })).toBeVisible();
});

test('10-12. le vendeur enregistre la vente et obtient un QR code', async () => {
  await seller.goto('/vendeur/ventes');
  await seller.getByRole('button', { name: 'Enregistrer une vente' }).click();
  await seller.getByLabel('Téléphone vendu').selectOption({ index: 1 });
  await seller.getByLabel('Référence de la transaction').fill(`FAC-${run}`);
  await seller.getByLabel('Numéro de l’acheteur').fill(BUYER_PHONE);
  const response = seller.waitForResponse((r) => r.url().endsWith('/api/v1/seller/sales') && r.request().method() === 'POST');
  await seller.getByRole('button', { name: /Enregistrer et générer le QR code/ }).click();
  const body = await (await response).json();
  reviewToken = (body.qr.url as string).split('#')[1];
  expect(reviewToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const dialog = seller.getByRole('dialog', { name: 'QR code d’avis' });
  await expect(dialog.getByRole('img', { name: /QR code/ })).toBeVisible();
  await expect(dialog.getByText('Ce code ne s’affiche qu’une seule fois')).toBeVisible();
  await dialog.getByRole('button', { name: 'Fermer' }).click();
  await expect(seller.getByText('Déclarée — en attente du client')).toBeVisible();
});

test('13-14. le client scanne le QR code, confirme son achat et publie un avis vérifié', async () => {
  await buyer.goto(`/avis#${reviewToken}`);
  // Le jeton est retiré de la barre d'adresse.
  await expect(buyer).toHaveURL(/\/avis$/);
  await expect(buyer.getByText(new RegExp(MODEL))).toBeVisible();
  await buyer.getByLabel('Votre numéro de téléphone').fill('90000000');
  await buyer.getByRole('radio', { name: /5 étoiles/ }).check({ force: true });
  await buyer.getByRole('button', { name: 'Publier mon avis' }).click();
  await expect(buyer.getByText(/ne correspond pas/)).toBeVisible();
  await buyer.getByLabel('Votre numéro de téléphone').fill(BUYER_PHONE);
  await buyer.getByLabel('Votre commentaire').fill(`Téléphone neuf, conforme à l’annonce (achat ${run}). Vendeur réactif.`);
  await buyer.getByRole('button', { name: 'Publier mon avis' }).click();
  await expect(buyer.getByText('Merci pour votre avis')).toBeVisible();
  await expect(buyer.getByText(/Achat vérifié/)).toBeVisible();

  // Le même code ne permet pas un second avis.
  await buyer.goto(`/avis#${reviewToken}`);
  await expect(buyer.getByText('Avis déjà déposé')).toBeVisible();

  await buyer.goto(productUrl);
  const reviews = buyer.locator('section', { has: buyer.getByRole('heading', { name: 'Avis clients' }) });
  await expect(reviews.getByText('Ama P.')).toBeVisible();
  await expect(reviews.getByText('Achat vérifié', { exact: true })).toBeVisible();
});

test('15. l’administration contrôle et masque l’avis ; il disparaît de la fiche', async ({ page }) => {
  await admin.goto(`${ADMIN}/avis`);
  await admin.getByRole('tab', { name: 'Publiés' }).click();
  const item = admin.getByRole('listitem').filter({ hasText: MODEL });
  await expect(item.getByText('Vérifiée selon la procédure')).toBeVisible();
  await item.getByRole('button', { name: 'Masquer' }).click();
  const dialog = admin.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Masquer' })).toBeDisabled(); // motif obligatoire
  await dialog.getByLabel(/Motif/).fill('Test de modération');
  await dialog.getByRole('button', { name: 'Masquer' }).click();
  await expect(admin.getByText('Décision enregistrée')).toBeVisible();

  await page.goto(productUrl);
  const reviews = page.locator('section', { has: page.getByRole('heading', { name: 'Avis clients' }) });
  await expect(reviews.getByText('Pas encore d’avis')).toBeVisible();
  await expect(reviews.getByText('Ama P.')).toHaveCount(0);
  await admin.goto(`${ADMIN}/journal`);
  await expect(admin.getByText('review.hide').first()).toBeVisible();
});

test('16. l’administration publie une publicité ; elle s’affiche en fond de l’accueil avec la mention « Publicité »', async ({ page }) => {
  const title = `Offre Parcours ${run}`;
  await admin.goto(`${ADMIN}/publicites`);
  await admin.getByLabel('Image de la publicité').setInputFiles({ name: 'pub.png', mimeType: 'image/png', buffer: solidPng(1600, 900, [27, 58, 107]) });
  await expect(admin.getByAltText('Aperçu de l’image')).toBeVisible();
  const form = admin.locator('form', { has: admin.getByRole('heading', { name: 'Nouvelle publicité' }) });
  await form.getByLabel('Titre', { exact: true }).fill(title);
  await form.getByLabel(/Annonceur/).fill('Annonceur E2E');
  await form.getByLabel(/Lien/).fill('/promotions');
  await form.getByRole('button', { name: 'Publier la publicité' }).click();
  await expect(admin.getByText('Publicité créée')).toBeVisible();
  const row = admin.getByRole('listitem').filter({ hasText: title });
  await expect(row.getByText('En ligne')).toBeVisible();

  await page.goto('/');
  await expect(page.getByText('Publicité · Annonceur E2E')).toBeVisible();
  await expect(page.getByText(title)).toBeVisible();
  await page.getByRole('link', { name: /Découvrir/ }).click();
  await expect(page).toHaveURL(/\/promotions$/);

  // Désactivée, elle disparaît de l'accueil.
  await row.getByRole('button', { name: 'Désactiver' }).click();
  await expect(admin.getByText('Publicité désactivée')).toBeVisible();
  await page.goto('/');
  await expect(page.getByText(title)).toHaveCount(0);
});

test('les vendeurs n’ont pas accès à l’administration', async () => {
  // L'ancienne adresse /admin du site renvoie vers l'application d'administration, qui refuse ce compte.
  await seller.goto('/admin');
  // En local, les cookies sont partagés entre ports : la session vendeur est reconnue puis refusée.
  // En production (domaines distincts), le vendeur n'a aucune session sur l'administration : connexion demandée.
  await expect(seller).toHaveURL(new RegExp(`^${ADMIN}/connexion`));
  const res = await seller.request.get('/api/v1/admin/stats');
  expect(res.status()).toBe(403);
});
