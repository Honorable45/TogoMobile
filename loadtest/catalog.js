// Test de charge TogoMobile — parcours réalistes d'acheteurs (lecture seule).
// Usage : k6 run -e BASE=http://localhost:4500/api/v1 -e PRODUCTS=100000 loadtest/catalog.js
// Ne jamais lancer contre la production sans autorisation et plan de protection.
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const BASE = __ENV.BASE || 'http://localhost:4500/api/v1';
const PRODUCTS = Number(__ENV.PRODUCTS || 100000);
const SHOPS = Number(__ENV.SHOPS || 200);
const STAGE = __ENV.STAGE_SECONDS || '45';

// MODE=constant VUS=50 DURATION=40s : charge constante (mesure d'un palier isolé).
const CONSTANT = __ENV.MODE === 'constant';

export const options = {
  scenarios: CONSTANT
    ? { constant: { executor: 'constant-vus', vus: Number(__ENV.VUS || 50), duration: __ENV.DURATION || '40s' } }
    : {
    paliers: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 10 },
        { duration: `${STAGE}s`, target: 10 },
        { duration: '10s', target: 50 },
        { duration: `${STAGE}s`, target: 50 },
        { duration: '10s', target: 100 },
        { duration: `${STAGE}s`, target: 100 },
        { duration: '10s', target: 200 },
        { duration: `${STAGE}s`, target: 200 },
        { duration: '10s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

const catalog = new Trend('t_catalogue', true);
const product = new Trend('t_fiche', true);
const shop = new Trend('t_boutique', true);
const search = new Trend('t_recherche', true);
const home = new Trend('t_accueil', true);

const SEARCHES = ['galaxy a15', 'iphone 13', 'camon', 'redmi note', 'pixel', 'tp-0042', 'samsung 128'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const ok = (r) => check(r, { 'statut 200': (x) => x.status === 200 });

export default function () {
  group('accueil', () => {
    const r = http.get(`${BASE}/home`, { tags: { name: 'home' } });
    ok(r);
    home.add(r.timings.duration);
  });
  sleep(Math.random() * 1.5);
  group('catalogue', () => {
    const params = pick(['', '?sort=price_asc', '?brand=samsung,apple', '?promo=true&sort=discount', '?minPrice=50000&maxPrice=150000&storage=128', `?page=${1 + Math.floor(Math.random() * 20)}`]);
    const r = http.get(`${BASE}/catalog/products${params}`, { tags: { name: 'catalog' } });
    ok(r);
    catalog.add(r.timings.duration);
  });
  sleep(Math.random() * 1.5);
  group('recherche', () => {
    const r = http.get(`${BASE}/catalog/products?q=${encodeURIComponent(pick(SEARCHES))}`, { tags: { name: 'search' } });
    ok(r);
    search.add(r.timings.duration);
  });
  sleep(Math.random() * 1.5);
  group('fiche', () => {
    const slug = `perf-produit-${1 + Math.floor(Math.random() * PRODUCTS)}`;
    const r = http.get(`${BASE}/products/${slug}`, { tags: { name: 'product' } });
    check(r, { 'fiche 200 ou 404': (x) => x.status === 200 || x.status === 404 });
    product.add(r.timings.duration);
    http.get(`${BASE}/products/${slug}/reviews?pageSize=5`, { tags: { name: 'reviews' } });
  });
  sleep(Math.random() * 1.5);
  group('boutique', () => {
    const s = `boutique-perf-${1 + Math.floor(Math.random() * SHOPS)}`;
    const r = http.get(`${BASE}/shops/${s}`, { tags: { name: 'shop' } });
    ok(r);
    shop.add(r.timings.duration);
    http.get(`${BASE}/catalog/products?shop=${s}`, { tags: { name: 'shop-catalog' } });
    http.get(`${BASE}/promotions?shop=${s}&pageSize=12`, { tags: { name: 'shop-promos' } });
  });
  sleep(1 + Math.random() * 2);
}
