// Test de charge des pages du site (rendu Next.js + cache par étiquettes).
// Usage : k6 run -e SITE=http://localhost:3500 -e MODE=constant -e VUS=100 loadtest/pages.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const SITE = __ENV.SITE || 'http://localhost:3500';
const PRODUCTS = Number(__ENV.PRODUCTS || 100000);
export const options = {
  scenarios: { constant: { executor: 'constant-vus', vus: Number(__ENV.VUS || 50), duration: __ENV.DURATION || '40s' } },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};
// Longue traîne réaliste : 80 % des visites sur les 2 000 annonces les plus vues, 20 % sur tout le catalogue.
const productSlug = () => `perf-produit-${Math.random() < 0.8 ? 1 + Math.floor(Math.random() * 2000) : 1 + Math.floor(Math.random() * PRODUCTS)}`;
const pages = [
  () => '/',
  () => '/catalogue',
  () => '/catalogue?brand=samsung',
  () => `/produits/${productSlug()}`,
  () => `/produits/${productSlug()}`,
  () => `/boutiques/boutique-perf-${1 + Math.floor(Math.random() * 200)}`,
  () => '/promotions',
];
export default function () {
  const path = pages[Math.floor(Math.random() * pages.length)]();
  const r = http.get(`${SITE}${path}`, { tags: { name: path.split('/')[1] || 'accueil' } });
  check(r, { 'page 200 ou 404': (x) => x.status === 200 || x.status === 404 });
  sleep(1 + Math.random() * 2);
}
