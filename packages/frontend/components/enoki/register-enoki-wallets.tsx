'use client';

import { useSuiClientContext } from '@mysten/dapp-kit';
import {
  EnokiClient,
  isEnokiNetwork,
  registerEnokiWallets,
  type RegisterEnokiWalletsOptions,
} from '@mysten/enoki';
import { useEffect, useState } from 'react';

import { getPublicEnokiApiKey } from '../../lib/enoki-config';

export function RegisterEnokiWallets() {
  const { client, network } = useSuiClientContext();
  const apiKey = getPublicEnokiApiKey();
  const [providerConfig, setProviderConfig] = useState<
    RegisterEnokiWalletsOptions['providers'] | null
  >(null);

  useEffect(() => {
    if (!apiKey) return;

    const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
    if (googleClientId) {
      setProviderConfig({
        google: { clientId: googleClientId },
      });
      return;
    }

    let cancelled = false;
    const enoki = new EnokiClient({ apiKey });
    enoki
      .getApp()
      .then((app) => {
        if (cancelled) return;
        const providers: RegisterEnokiWalletsOptions['providers'] = {};
        for (const p of app.authenticationProviders) {
          providers[p.providerType] = { clientId: p.clientId };
        }
        setProviderConfig(providers);
      })
      .catch(() => {
        if (!cancelled) setProviderConfig({});
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  useEffect(() => {
    if (!apiKey || !providerConfig) return;
    if (!isEnokiNetwork(network)) return;

    const hasProvider = Object.values(providerConfig).some((p) => p?.clientId);
    if (!hasProvider) return;

    const filtered = Object.fromEntries(
      Object.entries(providerConfig).filter(([, v]) => v?.clientId),
    ) as RegisterEnokiWalletsOptions['providers'];

    const { unregister } = registerEnokiWallets({
      apiKey,
      providers: filtered,
      client: client as never,
      network,
    });

    return unregister;
  }, [apiKey, client, network, providerConfig]);

  return null;
}
