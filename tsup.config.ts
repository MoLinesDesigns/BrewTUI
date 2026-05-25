import { defineConfig } from 'tsup';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  entry: ['src/index.tsx', 'src/postinstall.ts'],
  format: ['esm'],
  target: 'node22',
  outDir: 'build',
  clean: true,
  sourcemap: 'hidden',
  external: ['react', 'react-devtools-core'],
  define: {
    'process.env.APP_VERSION': JSON.stringify(pkg.version),
    'process.env.NODE_ENV': '"production"',
    '__TEST_MODE__': 'false',
  },
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
});
