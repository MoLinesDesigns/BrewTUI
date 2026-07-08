#!/usr/bin/env node
// Polar — regional pricing helper.
//
// Polar tiene "Pricing per currency" en su dashboard pero solo via UI web.
// Esta utilidad lo automatiza vía Polar API: lista los products del proyecto,
// muestra sus prices existentes por moneda, y permite crear/actualizar prices
// regionales sin hacerlo a mano en el dashboard producto por producto.
//
// Uso:
//   POLAR_ACCESS_TOKEN=pat_xxx node scripts/polar-set-regional-prices.mjs list
//     → Lista todos los products del proyecto con sus prices existentes.
//
//   POLAR_ACCESS_TOKEN=pat_xxx node scripts/polar-set-regional-prices.mjs plan
//     → Calcula precios regionales sugeridos desde EUR base (5,45/48) sin tocar
//       nada. Imprime el diff que `apply` aplicaría.
//
//   POLAR_ACCESS_TOKEN=pat_xxx node scripts/polar-set-regional-prices.mjs apply
//     → Aplica los precios calculados. Usar tras revisar `plan`. Cada llamada
//       a la API se imprime; un fallo no para el resto (cada price es atómico).
//
// Token: Polar dashboard > Settings > API Keys > Create Personal Access Token.
// Permisos requeridos: products:read, products:write.
//
// Cómo Polar trata "Pricing per currency":
//   - Cada Product tiene 1+ Prices.
//   - Cada Price lleva (currency, price_amount, recurring_interval).
//   - Un product Pro Monthly puede tener Price-EUR + Price-USD + Price-GBP.
//   - Polar enseña automáticamente el price de la moneda del visitante.

import { existsSync, readFileSync } from 'node:fs';

const API_BASE = 'https://api.polar.sh/v1';

// Sourced from src/lib/license/polar-api.ts — keep in sync if products move.
const PRODUCTS = {
  proMonthly:  'b925b882-464c-40c1-9ffd-b088ab31d9a3',
  proYearly:   '8f97bb81-b950-4bc3-97c5-8133dd817d0b',
  teamMonthly: '7cf3fcb2-560d-4fbb-9936-15efac511b23',
  teamYearly:  'd096914d-902d-47b0-8d62-5c7e6fc4e087',
};

// Base prices in EUR (canonical reference). Cents to avoid float drift.
// Pro: 5,45/mes · 48/año (se ajustan editando aquí + reaplicando `plan` → `apply`).
// Team: precios por seat * 3 (Polar enforcement de min seats es por checkout URL).
const EUR_BASE_CENTS = {
  proMonthly:  545,
  proYearly:   4800,
  teamMonthly: 2400,   // 8€/seat * 3 = 24€ (mínimo 3 seats)
  teamYearly:  24480,  // 81.60€/seat * 3 = 244.80€
};

// FX hint rates relative to 1 EUR. Used to pre-compute regional amounts.
// These are *psychological-price* anchors, not real-time rates. Polar acepta
// cualquier amount; aquí elegimos números limpios cercanos al FX real.
//
// Si la cotización se mueve mucho, basta con editar la tabla y re-ejecutar.
const REGIONAL_PRICES_CENTS = {
  // currency: { proMonthly, proYearly, teamMonthly, teamYearly }
  USD: { proMonthly:  599, proYearly:  5200, teamMonthly:  2700, teamYearly:  26500 },
  GBP: { proMonthly:  475, proYearly:  4200, teamMonthly:  2100, teamYearly:  21400 },
  CAD: { proMonthly:  799, proYearly:  7000, teamMonthly:  3600, teamYearly:  35800 },
  AUD: { proMonthly:  899, proYearly:  7900, teamMonthly:  4000, teamYearly:  40200 },
};

const RECURRENCE_BY_KIND = { proMonthly: 'month', proYearly: 'year', teamMonthly: 'month', teamYearly: 'year' };

// ─────────────────────────────────────────────────────────────────────────────

function loadToken() {
  let token = process.env.POLAR_ACCESS_TOKEN;
  // Convenience: pick the token from a local .env file if present (gitignored).
  if (!token && existsSync('.env.polar')) {
    const lines = readFileSync('.env.polar', 'utf-8').split('\n');
    for (const line of lines) {
      const m = line.match(/^\s*POLAR_ACCESS_TOKEN\s*=\s*(.+?)\s*$/);
      if (m) { token = m[1].replace(/^["']|["']$/g, ''); break; }
    }
  }
  if (!token) {
    console.error('✘ POLAR_ACCESS_TOKEN is required. Either export it or place it in .env.polar.');
    process.exit(1);
  }
  return token;
}

async function polar(method, path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = { _raw: text }; }
  if (!res.ok) {
    throw new Error(`Polar API ${method} ${path} → HTTP ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

function fmt(cents, currency) {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

async function listProducts() {
  console.log('━━ Polar products in the BrewTUI-Bar project ━━\n');
  for (const [kind, id] of Object.entries(PRODUCTS)) {
    let product;
    try { product = await polar('GET', `/products/${id}`); }
    catch (err) { console.log(`✘ ${kind} (${id})\n   ${err.message}\n`); continue; }
    console.log(`▸ ${kind} — ${product.name ?? '(unnamed)'}`);
    const prices = product.prices ?? [];
    if (prices.length === 0) {
      console.log('   (no prices yet)\n');
      continue;
    }
    for (const p of prices) {
      const recurrence = p.recurring_interval ?? '—';
      const tags = [recurrence];
      if (p.is_archived) tags.push('archived');
      console.log(`   ${fmt(p.price_amount, p.price_currency)}  (${tags.join(', ')})  id=${p.id}`);
    }
    console.log('');
  }
}

function planChanges() {
  const plans = [];
  for (const [currency, byKind] of Object.entries(REGIONAL_PRICES_CENTS)) {
    for (const [kind, amount] of Object.entries(byKind)) {
      plans.push({
        productKey: kind,
        productId: PRODUCTS[kind],
        currency,
        amount_cents: amount,
        recurring_interval: RECURRENCE_BY_KIND[kind],
      });
    }
  }
  return plans;
}

async function planAction() {
  console.log('━━ Plan: regional prices to apply ━━\n');
  console.log('EUR base (already configured in Polar, do not re-create here):');
  for (const [kind, amount] of Object.entries(EUR_BASE_CENTS)) {
    console.log(`   ${kind.padEnd(13)}  ${fmt(amount, 'EUR')}  ${RECURRENCE_BY_KIND[kind]}`);
  }
  console.log('\nNew regional prices (to be created/updated):');
  for (const plan of planChanges()) {
    console.log(`   ${plan.productKey.padEnd(13)}  ${fmt(plan.amount_cents, plan.currency)}  ${plan.recurring_interval}`);
  }
  console.log('\nRun with `apply` to execute. Existing prices in matching currency+interval will be updated; missing ones created.');
}

async function applyAction() {
  const plans = planChanges();
  console.log(`━━ Applying ${plans.length} regional prices ━━\n`);

  // Fetch existing prices per product to decide PATCH vs POST
  const existingByProduct = new Map();
  for (const id of Object.values(PRODUCTS)) {
    try {
      const product = await polar('GET', `/products/${id}`);
      existingByProduct.set(id, product.prices ?? []);
    } catch (err) {
      console.error(`✘ Cannot read product ${id}: ${err.message}`);
      existingByProduct.set(id, []);
    }
  }

  let applied = 0; let skipped = 0; let failed = 0;
  for (const plan of plans) {
    const existing = (existingByProduct.get(plan.productId) ?? [])
      .filter((p) => !p.is_archived
        && p.price_currency?.toUpperCase() === plan.currency.toUpperCase()
        && p.recurring_interval === plan.recurring_interval);

    if (existing.length > 0) {
      const target = existing[0];
      if (target.price_amount === plan.amount_cents) {
        console.log(`= ${plan.productKey.padEnd(13)} ${plan.currency} ${plan.recurring_interval}  unchanged`);
        skipped += 1;
        continue;
      }
      try {
        await polar('PATCH', `/prices/${target.id}`, { price_amount: plan.amount_cents });
        console.log(`✓ ${plan.productKey.padEnd(13)} ${plan.currency} ${plan.recurring_interval}  ${fmt(target.price_amount, plan.currency)} → ${fmt(plan.amount_cents, plan.currency)}`);
        applied += 1;
      } catch (err) {
        console.error(`✘ ${plan.productKey} ${plan.currency}: ${err.message}`);
        failed += 1;
      }
      continue;
    }

    // No matching existing price → create
    try {
      await polar('POST', `/products/${plan.productId}/prices`, {
        type: 'recurring',
        recurring_interval: plan.recurring_interval,
        price_amount: plan.amount_cents,
        price_currency: plan.currency,
      });
      console.log(`+ ${plan.productKey.padEnd(13)} ${plan.currency} ${plan.recurring_interval}  ${fmt(plan.amount_cents, plan.currency)}  (new)`);
      applied += 1;
    } catch (err) {
      console.error(`✘ ${plan.productKey} ${plan.currency}: ${err.message}`);
      failed += 1;
    }
  }

  console.log(`\nApplied ${applied}, skipped ${skipped}, failed ${failed}.`);
  if (failed > 0) process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────

const TOKEN = loadToken();
const action = process.argv[2] ?? 'plan';

const handlers = { list: listProducts, plan: planAction, apply: applyAction };
const handler = handlers[action];
if (!handler) {
  console.error(`Unknown action: ${action}. Use one of: ${Object.keys(handlers).join(', ')}`);
  process.exit(1);
}
await handler();
