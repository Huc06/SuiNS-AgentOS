import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['bin/agentos.ts'],
  format: ['esm'],
  outDir: 'dist',
  dts: false,
  sourcemap: true,
  clean: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
});
