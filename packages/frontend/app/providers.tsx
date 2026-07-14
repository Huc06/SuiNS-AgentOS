'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createNetworkConfig, SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import { useState } from 'react';

import { RegisterEnokiWallets } from '../components/enoki/register-enoki-wallets';
import { getSuiNetwork, getSuiRpcUrl } from '../lib/enoki-config';

const { networkConfig } = createNetworkConfig({
  testnet: { url: getSuiRpcUrl('testnet') },
  mainnet: { url: getSuiRpcUrl('mainnet') },
});

const defaultNetwork = getSuiNetwork() === 'mainnet' ? 'mainnet' : 'testnet';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork={defaultNetwork}>
        <RegisterEnokiWallets />
        <WalletProvider autoConnect>{children}</WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
