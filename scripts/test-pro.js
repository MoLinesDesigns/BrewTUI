#!/usr/bin/env node

/**
 * Generate a test Pro license for local development/testing.
 * Creates a valid encrypted license.json in ~/.brewtui-bar/
 *
 * Usage:
 *   node scripts/test-pro.js          # Create test Pro license
 *   node scripts/test-pro.js --clear  # Remove test license (back to Free)
 */

import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync, renameSync } from 'node:fs';
import { createCipheriv, randomBytes, randomUUID, hkdfSync } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DATA_DIR = join(homedir(), '.brewtui-bar');
const LICENSE_PATH = join(DATA_DIR, 'license.json');
const MACHINE_ID_PATH = join(DATA_DIR, 'machine-id');

// Same encryption constants as src/lib/license/license-manager.ts
const ENCRYPTION_SECRET = 'brewtui-bar-license-aes256gcm-v1';
const HKDF_SALT = 'brewtui-bar-salt-v1';

function getMachineId() {
  if (existsSync(MACHINE_ID_PATH)) {
    return readFileSync(MACHINE_ID_PATH, 'utf8').trim();
  }
  const machineId = randomUUID();
  writeFileSync(MACHINE_ID_PATH, machineId, { encoding: 'utf8', mode: 0o600 });
  return machineId;
}

function deriveKey(machineId) {
  return Buffer.from(hkdfSync('sha256', ENCRYPTION_SECRET, HKDF_SALT, machineId, 32));
}

function encrypt(data, machineId) {
  const key = deriveKey(machineId);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = JSON.stringify(data);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encrypted: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

if (process.argv.includes('--clear')) {
  try {
    rmSync(LICENSE_PATH);
    console.log('\u2714 Test license removed. Back to Free tier.');
  } catch {
    console.log('No license file found.');
  }
  process.exit(0);
}

const license = {
  key: (process.env.BREWTUI_OWNER_LICENSE_KEY || 'OWNER-PRO-' + randomBytes(12).toString('hex')),
  instanceId: 'owner-local-' + randomBytes(8).toString('hex'),
  status: 'active',
  customerEmail: process.env.BREWTUI_OWNER_EMAIL || 'test@molinesdesigns.com',
  customerName: process.env.BREWTUI_OWNER_NAME || 'Local Owner',
  plan: 'pro',
  activatedAt: new Date().toISOString(),
  expiresAt: null,
  lastValidatedAt: new Date().toISOString(),
};

mkdirSync(DATA_DIR, { recursive: true });

const machineId = getMachineId();
const { encrypted, iv, tag } = encrypt(license, machineId);
const file = { version: 1, encrypted, iv, tag, machineId };
const tmpPath = LICENSE_PATH + '.tmp';
writeFileSync(tmpPath, JSON.stringify(file, null, 2), { encoding: 'utf8', mode: 0o600 });
renameSync(tmpPath, LICENSE_PATH);

console.log('\u2714 Test Pro license created');
console.log('');
console.log('  Email:     ' + license.customerEmail);
console.log('  Key:       ' + license.key.slice(0, 12) + '...');
console.log('  Path:      ' + LICENSE_PATH);
console.log('');
console.log('Now you can:');
console.log('  1. npm run dev           \u2192 TUI with all Pro features');
console.log('  2. Open BrewBar.app      \u2192 Should pass license check');
console.log('  3. brewtui-bar status       \u2192 Should show Plan: Pro');
console.log('');
console.log('To remove: node scripts/test-pro.js --clear');
