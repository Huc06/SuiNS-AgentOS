'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import { getFullnodeUrl } from '@mysten/sui/client';
import { useState } from 'react';

const networks = {
  testnet: { url: getFullnodeUrl('testnet') },
};

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="testnet">
        <WalletProvider>{children}</WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
