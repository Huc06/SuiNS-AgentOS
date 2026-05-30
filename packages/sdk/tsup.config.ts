import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    'react',
    '@mysten/sui',
    '@mysten/sui/client',
    '@mysten/sui/cryptography',
    '@mysten/sui/transactions',
    '@mysten/sui/experimental',
    '@mysten/seal',
    '@mysten/dapp-kit',
    '@tanstack/react-query',
  ],
});
