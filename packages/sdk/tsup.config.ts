import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/node.ts', 'src/walrus-mainnet.ts'],
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
    '@mysten/sui/grpc',
    '@mysten/seal',
    '@mysten/dapp-kit',
    '@mysten/walrus',
    '@mysten/walrus-wasm',
    '@tanstack/react-query',
  ],
});
