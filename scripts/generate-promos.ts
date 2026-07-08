#!/usr/bin/env npx tsx
/**
 * Generate promo codes for BrewTUI-Bar Pro.
 *
 * Usage:
 *   npx tsx scripts/generate-promos.ts                          # 10 trial codes, 14 days
 *   npx tsx scripts/generate-promos.ts --count 50               # 50 codes
 *   npx tsx scripts/generate-promos.ts --type full --days 365   # 1-year full access
 *   npx tsx scripts/generate-promos.ts --prefix LAUNCH --days 30 --count 100
 *   npx tsx scripts/generate-promos.ts --json                   # Output as JSON (for DB import)
 */

import { generatePromoBatch } from '../src/lib/license/promo.js';

// ── Parse CLI args ──

const args = process.argv.slice(2);

function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1]! : fallback;
}

const count = parseInt(getArg('count', '10'), 10);
const type = getArg('type', 'trial') as 'trial' | 'discount' | 'full';
const days = parseInt(getArg('days', '14'), 10);
const prefix = getArg('prefix', 'BREW');
const maxRedemptions = parseInt(getArg('max-uses', '1'), 10);
const expiresIn = getArg('expires-in', '');
const jsonOutput = args.includes('--json');

// Calculate expiration date if provided (e.g. "90d" = 90 days from now)
let expiresAt: string | null = null;
if (expiresIn) {
  const match = expiresIn.match(/^(\d+)d$/);
  if (match) {
    expiresAt = new Date(Date.now() + parseInt(match[1]!, 10) * 24 * 60 * 60 * 1000).toISOString();
  }
}

// ── Generate ──

const codes = generatePromoBatch(count, {
  type,
  durationDays: days,
  maxRedemptions,
  expiresAt,
  prefix,
});

// ── Output ──

if (jsonOutput) {
  // JSON format ready for database import
  console.log(JSON.stringify(codes, null, 2));
} else {
  console.log(`\nGenerated ${count} promo codes:\n`);
  console.log(`  Type: ${type}`);
  console.log(`  Duration: ${days} days of Pro access`);
  console.log(`  Max uses per code: ${maxRedemptions}`);
  if (expiresAt) console.log(`  Codes expire: ${expiresAt}`);
  console.log(`\n${'─'.repeat(50)}\n`);

  for (const code of codes) {
    console.log(`  ${code.code}`);
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`\n  Total: ${codes.length} codes`);
  console.log(`  Use --json flag for database-importable output.\n`);
}
