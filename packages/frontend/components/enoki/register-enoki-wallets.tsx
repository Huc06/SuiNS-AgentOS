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
  // TODO: set NEXT_PUBLIC_ENOKI_API_KEY + NEXT_PUBLIC_ENOKI_SPONSOR=true before demo
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

    // Enoki defaults redirectUrl to `window.location.href` (the full current
    // page URL, e.g. http://localhost:3000/create/some-slug) when unset. Google
    // OAuth requires an EXACT match against an Authorized redirect URI, so if
    // the registered URI is just the origin (http://localhost:3000) and the
    // user clicks "Sign in with Google" from any other page/path, Google
    // rejects the request with "invalid_request" before the account picker
    // ever shows. Pin redirectUrl to the origin so it always matches.
    const redirectUrl =
      typeof window !== "undefined" ? window.location.origin : undefined;
    const filtered = Object.fromEntries(
      Object.entries(providerConfig)
        .filter(([, v]) => v?.clientId)
        .map(([provider, v]) => [provider, { ...v, redirectUrl }]),
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
