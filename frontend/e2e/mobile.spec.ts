import { expect, test } from '@playwright/test';

/** Spécificités mobiles (projet « mobile » : Pixel 7, écran tactile). */

test('navigation inférieure et filtres dans un panneau dédié', async ({ page }) => {
  await page.goto('/catalogue');
  // Navigation sur une seconde ligne de l'en-tête, sans menu hamburger.
  const nav = page.getByRole('navigation', { name: 'Navigation mobile' });
  await expect(nav.getByRole('link')).toHaveCount(4);
  await expect(nav.getByRole('link', { name: 'Catalogue' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('banner').getByRole('link', { name: 'Devenir vendeur' })).toBeVisible();
  const filters = page.getByRole('form', { name: 'Filtres du catalogue' });
  await expect(filters).toBeHidden();
  await page.getByRole('button', { name: 'Filtres' }).click();
  await expect(filters).toBeVisible();
  await filters.getByText('Tecno', { exact: true }).click();
  await filters.getByRole('button', { name: /Afficher/ }).click();
  await expect(page).toHaveURL(/brand=tecno/);
  await expect(filters).toBeHidden();
  for (const text of await page.locator('article').allInnerTexts()) expect(text).toContain('Tecno');
});

test('fiche produit : barre de commande WhatsApp toujours accessible', async ({ page }) => {
  await page.goto('/catalogue?q=camon');
  await page.getByRole('link', { name: /Tecno Camon 20/ }).click();
  const buttons = page.getByRole('button', { name: 'Commander sur WhatsApp' });
  await page.mouse.wheel(0, 2500);
  await expect(buttons.last()).toBeInViewport();
});

test('carrousel des promotions : défilement tactile', async ({ page }) => {
  await page.goto('/boutiques/lome-phones-demo');
  const track = page.getByRole('region', { name: 'Promotions en cours' }).locator('[aria-live]');
  await track.evaluate((el) => el.scrollBy({ left: el.clientWidth, behavior: 'instant' as ScrollBehavior }));
  await expect.poll(() => track.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
});

test('aucun défilement horizontal sur les pages principales', async ({ page }) => {
  const paths = ['/', '/catalogue', '/promotions', '/boutiques', '/boutiques/lome-phones-demo', '/connexion', '/inscription', '/devenir-vendeur', '/moderation', '/avis'];
  for (const path of paths) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `débordement horizontal sur ${path}`).toBeLessThanOrEqual(0);
  }
  await page.goto('/catalogue?q=iphone%2013');
  await page.getByRole('link', { name: /Apple iPhone 13 128 Go/ }).click();
  await page.waitForURL(/\/produits\//);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
