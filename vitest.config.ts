import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: false,
    // QA-FLAKE: el pool por defecto `forks` falla a iniciar workers cuando
    // vitest se ejecuta dentro de `git push` (husky pre-push). El stdio
    // restringido del proceso git rompe el handshake IPC del pool de forks
    // y un test al azar reporta "Failed to start forks worker" + "Timeout
    // waiting for worker to respond" pese a que la suite pasa aislada.
    // `threads` usa workers Node nativos sin spawn de subproceso y
    // no se ve afectado por el stdio del padre.
    pool: 'threads',
    // QA-001: bajo el pool paralelo de vitest, los tests que renderizan
    // varios componentes Ink consecutivos (ConfirmDialog, ResultBanner,
    // app.test) superan el timeout por defecto de 5 s cuando 60 archivos
    // compiten por CPU. Aislados tardan menos de 1 s. 15 s deja margen
    // amplio sin enmascarar tests realmente lentos.
    testTimeout: 15_000,
    // QA-004: coverage is enforced through `npm run test:coverage` and
    // therefore through `npm run validate`. Plain `npm test` stays fast.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      exclude: [
        'build/**',
        'dist-standalone/**',
        'menubar/**',
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/__mocks__/**',
        'src/**/*.d.ts',
      ],
      thresholds: {
        // Real floor for the measured production surface. Branch coverage is
        // lower because many Ink view branches still need interaction-level
        // tests; keep it enforced so new work cannot regress the current base.
        lines: 64,
        functions: 64,
        branches: 45,
        statements: 63,
      },
    },
  },
});
