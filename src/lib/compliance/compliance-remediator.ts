import { streamBrew } from '../brew-cli.js';
import { validatePackageName } from '../brew-api.js';
import type { ComplianceViolation } from './types.js';

export async function* remediateViolations(
  violations: ComplianceViolation[],
  isPro: boolean,
): AsyncGenerator<string> {
  if (!isPro) throw new Error('Pro license required');

  let installed = 0;
  let upgraded = 0;
  let skipped = 0;

  for (const v of violations) {
    if (v.type === 'missing') {
      // SEG-001: validar antes del spawn para que un PolicyFile artesanal no
      // inyecte flags (`--HEAD`, taps privados) via el nombre del paquete.
      try {
        validatePackageName(v.packageName);
      } catch (err) {
        yield `  ✗ Rejected ${v.packageName}: ${err instanceof Error ? err.message : String(err)}`;
        skipped++;
        continue;
      }
      yield `Installing ${v.packageName}...`;
      try {
        for await (const line of streamBrew(['install', v.packageName])) {
          yield line;
        }
        installed++;
      } catch (err) {
        yield `  ✗ Failed to install ${v.packageName}: ${err instanceof Error ? err.message : String(err)}`;
        skipped++;
      }
    } else if (v.type === 'wrong-version') {
      try {
        validatePackageName(v.packageName);
      } catch (err) {
        yield `  ✗ Rejected ${v.packageName}: ${err instanceof Error ? err.message : String(err)}`;
        skipped++;
        continue;
      }
      yield `Upgrading ${v.packageName}${v.required ? ` to ${v.required}+` : ''}...`;
      try {
        for await (const line of streamBrew(['upgrade', v.packageName])) {
          yield line;
        }
        upgraded++;
      } catch (err) {
        yield `  ✗ Failed to upgrade ${v.packageName}: ${err instanceof Error ? err.message : String(err)}`;
        skipped++;
      }
    } else if (v.type === 'forbidden') {
      yield `  ⚠ Forbidden package detected: ${v.packageName} — manual removal required`;
      skipped++;
    } else if (v.type === 'extra') {
      yield `  ⚠ Extra package in strict mode: ${v.packageName} — manual removal required`;
      skipped++;
    }
  }

  yield `Remediation complete: ${installed} installed, ${upgraded} upgraded, ${skipped} skipped (manual action required)`;
}
