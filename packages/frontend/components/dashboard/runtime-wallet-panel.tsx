'use client';

import { useSuiClient } from '@mysten/dapp-kit';
import { useCallback, useEffect, useState } from 'react';

import { getSuiNetwork } from '../../lib/enoki-config';

interface RuntimeWalletPanelProps {
  mode: 'connected' | 'generated';
  address: string;
  onAddressChange?: (addr: string) => void;
}

/**
 * Runtime wallet panel for the Create Agent wizard (#34).
 * Shows the runtime address as a QR-like display with Copy + balance + faucet link.
 */
export function RuntimeWalletPanel({ mode, address }: RuntimeWalletPanelProps) {
  const suiClient = useSuiClient();
  const network = getSuiNetwork();
  const [balance, setBalance] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchBalance = useCallback(async () => {
    if (!address || address === '0x0') {
      setBalance(null);
      return;
    }
    setRefreshing(true);
    try {
      const result = await suiClient.getBalance({ owner: address });
      const sui = (parseInt(result.totalBalance, 10) / 1e9).toFixed(4);
      setBalance(sui);
    } catch {
      setBalance('0.0000');
    } finally {
      setRefreshing(false);
    }
  }, [address, suiClient]);

  useEffect(() => {
    void fetchBalance();
  }, [fetchBalance]);

  const faucetUrl =
    network === 'testnet'
      ? `https://faucet.testnet.sui.io`
      : null;

  return (
    <div className="border-2 border-pure-black bg-white p-4 neo-shadow">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-xs font-bold uppercase text-on-surface-variant">
          {mode === 'generated' ? '⚠ Demo-only generated wallet' : 'Runtime Wallet'}
        </span>
        {mode === 'generated' && (
          <span className="border border-amber-600 bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-700">
            SESSION ONLY
          </span>
        )}
      </div>

      {/* Address display (QR placeholder — actual QR requires qrcode.react) */}
      <div className="mb-3 border-2 border-pure-black bg-surface-container p-3">
        <code className="block break-all font-mono text-xs font-bold">{address || '—'}</code>
      </div>

      {/* Copy + QR visual */}
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(address)}
          className="border-2 border-pure-black bg-white px-3 py-1 font-mono text-xs font-bold transition-colors hover:bg-surface-container"
        >
          Copy Address
        </button>
        <div className="h-16 w-16 border-2 border-pure-black bg-pure-black/5 p-1" title="QR code (install qrcode.react for full QR)">
          {/* Simplified QR placeholder grid */}
          <div className="grid h-full w-full grid-cols-4 grid-rows-4 gap-px">
            {Array.from({ length: 16 }).map((_, i) => (
              <div key={i} className={`${i % 3 === 0 ? 'bg-pure-black' : 'bg-white'}`} />
            ))}
          </div>
        </div>
      </div>

      {/* Balance */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-on-surface-variant">
          Balance: <span className="font-bold">{balance ?? '...'} SUI</span>
        </span>
        <button
          type="button"
          onClick={() => void fetchBalance()}
          disabled={refreshing}
          className="font-mono text-xs font-bold text-electric-purple hover:underline disabled:opacity-50"
        >
          {refreshing ? '...' : 'Refresh'}
        </button>
      </div>

      {/* Faucet link */}
      {faucetUrl && (
        <a
          href={faucetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 block font-mono text-xs font-bold text-vibrant-blue hover:underline"
        >
          Get testnet SUI from faucet →
        </a>
      )}

      {mode === 'generated' && (
        <p className="mt-3 border-t border-pure-black/10 pt-2 font-mono text-[10px] text-amber-700">
          This key is generated in-browser for demo only. It is NOT persisted — do not use for real funds.
        </p>
      )}
    </div>
  );
}
