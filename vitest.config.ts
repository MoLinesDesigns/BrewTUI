import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: false,
    // QA-FLAKE: el pool por defecto `forks` falla a iniciar workers cuando
    // vitest se ejecuta dentro de `git push` (husky pre-push). El stdio
    // restringido del proceso git rompe el handshake IPC del pool de forks
    // y un test al azar reporta "Failed to start forks worker" + "Timeout
    // waiting for worker to respond" pese a que los 442 tests restantes
    // pasan. `threads` usa workers Node nativos sin spawn de subproceso y
    // no se ve afectado por el stdio del padre. Aislado tarda lo mismo y
    // los tests siguen pasando 443/443.
    pool: 'threads',
    // QA-001: bajo el pool paralelo de vitest, los tests que renderizan
    // varios componentes Ink consecutivos (ConfirmDialog, ResultBanner,
    // app.test) superan el timeout por defecto de 5 s cuando 60 archivos
    // compiten por CPU. Aislados tardan menos de 1 s. 15 s deja margen
    // amplio sin enmascarar tests realmente lentos.
    testTimeout: 15_000,
    // QA-004: coverage shape is defined here so `npm run test -- --coverage`
    // produces a useful report once the v8 provider is installed. Default
    // runs do NOT collect coverage (provider+excludes are inert without the
    // flag), so the regular test command stays fast and the dependency on
    // @vitest/coverage-v8 is optional until someone needs the metric.
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
        // Soft floor — fails the run if a regression drops coverage on the
        // measured surface. Tweak as the test base grows.
        lines: 50,
        functions: 50,
        branches: 60,
        statements: 50,
      },
    },
  },
});
