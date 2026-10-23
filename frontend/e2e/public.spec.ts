import { expect, test } from '@playwright/test';

/** Parcours visiteur sur les données de démonstration (pnpm db:seed -- --demo). */

test('la page d’accueil présente recherche, marques, promotions et boutiques', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('TogoMobile');
  await expect(page.getByText('Comparer, choisir et commander en confiance')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Catalogue' }).last()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Quel téléphone cherchez-vous ?' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Promotions en cours' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Récemment validées' })).toBeVisible();
});

test('recherche tolérante depuis l’accueil puis consultation d’une fiche', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'Rechercher un téléphone' }).first().fill('iphone13');
  await page.getByRole('searchbox', { name: 'Rechercher un téléphone' }).first().press('Enter');
  await expect(page).toHaveURL(/\/catalogue\?q=iphone13/);
  await expect(page.getByText(/1 téléphone/).first()).toBeVisible();
  await page.getByRole('link', { name: /Apple iPhone 13 128 Go/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Apple iPhone 13 128 Go' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Caractéristiques' })).toBeVisible();
  await expect(page.getByText('Apple A15 Bionic')).toBeVisible();
  // Champ non renseigné : jamais présenté comme un fait.
  await expect(page.getByRole('heading', { name: 'Avis clients' })).toBeVisible();
  await expect(page.getByText('Achat vérifié').first()).toBeVisible();
});

test('les filtres se combinent, se conservent dans l’URL et se réinitialisent', async ({ page }) => {
  await page.goto('/catalogue');
  const filters = page.getByRole('form', { name: 'Filtres du catalogue' });
  await filters.getByText('Samsung', { exact: true }).click();
  await expect(page).toHaveURL(/brand=samsung/);
  await filters.getByText('Neuf', { exact: true }).click();
  await expect(page).toHaveURL(/condition=NEW/);
  await expect(page).toHaveURL(/brand=samsung/);
  const cards = page.locator('article');
  await expect(cards.first()).toBeVisible();
  for (const text of await cards.allInnerTexts()) {
    expect(text).toContain('Samsung');
    expect(text).not.toMatch(/Occasion|Comme neuf|Reconditionné/);
  }
  await page.getByRole('combobox', { name: 'Trier les résultats' }).selectOption('price_desc');
  await expect(page).toHaveURL(/sort=price_desc/);
  await expect(page).toHaveURL(/brand=samsung/);
  await page.getByRole('button', { name: 'Réinitialiser' }).click();
  await expect(page).toHaveURL(/\/catalogue$/);
});

test('un catalogue vide propose d’effacer la recherche', async ({ page }) => {
  await page.goto('/catalogue?q=zzzz-introuvable');
  await expect(page.getByText('Aucun téléphone ne correspond à votre recherche')).toBeVisible();
  await page.getByRole('link', { name: 'Effacer la recherche et les filtres' }).click();
  await expect(page).toHaveURL(/\/catalogue$/);
});

test('le bouton WhatsApp ouvre une conversation avec le bon vendeur et un message complet', async ({ page, context }) => {
  await page.goto('/catalogue?q=redmi%20note');
  await page.getByRole('link', { name: /Redmi Note 12/ }).click();
  const reference = (await page.getByText(/Réf\. TM-/).first().innerText()).replace('Réf. ', '').trim();
  await context.route('https://wa.me/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<p>WhatsApp</p>' }));
  const popup = context.waitForEvent('page');
  await page.getByRole('button', { name: 'Commander sur WhatsApp' }).first().click();
  const wa = await popup;
  await wa.waitForURL(/wa\.me/);
  const url = new URL(wa.url());
  expect(url.pathname).toBe('/22892000003'); // numéro WhatsApp de la boutique « Atakpamé Tech (démo) »
  const message = url.searchParams.get('text')!;
  expect(message).toContain(reference);
  expect(message).toContain('/produits/');
  expect(message).toMatch(/99\s000 FCFA/);
});

test('page boutique : en-tête, réseaux sociaux, carrousel de promotions accessible et avis', async ({ page }) => {
  await page.goto('/boutiques/lome-phones-demo');
  await expect(page.getByRole('heading', { level: 1, name: 'Lomé Phones (démo)' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Contacter sur WhatsApp/ })).toHaveAttribute('href', /wa\.me\/22890000001/);
  await expect(page.getByRole('link', { name: 'Lomé Phones (démo) sur Facebook' })).toBeVisible();
  const carousel = page.getByRole('region', { name: 'Promotions en cours' });
  await expect(carousel).toBeVisible();
  await expect(carousel.getByRole('link', { name: 'Voir l’offre' }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tous les téléphones' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Avis sur la boutique' })).toBeVisible();
});

test('le carrousel défile toutes les 5 s, se met en pause au survol et sur demande', async ({ page }) => {
  await page.setViewportSize({ width: 500, height: 900 }); // largeur mobile : les offres débordent
  await page.goto('/boutiques/lome-phones-demo');
  const carousel = page.getByRole('region', { name: 'Promotions en cours' });
  const track = carousel.locator('[aria-live]');
  const pos = () => track.evaluate((el) => el.scrollLeft);
  expect(await pos()).toBe(0);
  await page.waitForTimeout(5800);
  expect(await pos()).toBeGreaterThan(0);
  // Pause explicite : plus aucun mouvement.
  await carousel.getByRole('button', { name: 'Mettre en pause le défilement automatique' }).click();
  await page.mouse.move(0, 0);
  const before = await pos();
  await page.waitForTimeout(6000);
  expect(await pos()).toBe(before);
  await expect(carousel.getByRole('button', { name: 'Reprendre le défilement automatique' })).toBeVisible();
});

test('aucun défilement automatique lorsque la réduction des animations est demandée', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 500, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('/boutiques/lome-phones-demo');
  const track = page.getByRole('region', { name: 'Promotions en cours' }).locator('[aria-live]');
  await page.waitForTimeout(6000);
  expect(await track.evaluate((el) => el.scrollLeft)).toBe(0);
  await ctx.close();
});

test('une annonce inexistante affiche un message clair', async ({ page }) => {
  const res = await page.goto('/produits/annonce-inexistante-xyz');
  expect(res?.status()).toBe(404);
  await expect(page.getByText('Cette annonce n’est plus disponible')).toBeVisible();
});

test('les espaces privés redirigent vers la connexion', async ({ page }) => {
  // L'administration est une application séparée : sans session, elle affiche sa propre connexion.
  await page.goto('/admin/boutiques');
  await expect(page).toHaveURL(/\/connexion\?next=%2Fboutiques/);
  await expect(page.getByRole('heading', { name: 'Administration' })).toBeVisible();
  await page.goto('/vendeur/produits');
  await expect(page).toHaveURL(/\/connexion\?next=%2Fvendeur%2Fproduits/);
});
