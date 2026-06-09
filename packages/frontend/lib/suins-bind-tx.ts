import { SuinsClient, SuinsTransaction, isSubName } from '@mysten/suins';
import { Transaction } from '@mysten/sui/transactions';

import type { SuiNetworkName } from './enoki-config';

type SuinsRpcClient = ConstructorParameters<typeof SuinsClient>[0]['client'];

export function buildBindAndMintPassportTx(options: {
  suiClient: SuinsRpcClient;
  network: SuiNetworkName;
  packageId: string;
  suinsName: string;
  runtimeWallet: string;
  nftId: string;
  needsBind: boolean;
  /** Tx signer — receives the minted passport object. */
  recipient: string;
}): Transaction {
  const tx = new Transaction();
  tx.setSender(options.recipient);

  const suinsClient = new SuinsClient({
    client: options.suiClient,
    network: options.network === 'mainnet' ? 'mainnet' : 'testnet',
  });
  const suinsTx = new SuinsTransaction(suinsClient, tx as never);

  if (options.needsBind) {
    suinsTx.setTargetAddress({
      nft: options.nftId,
      address: options.runtimeWallet,
      isSubname: isSubName(options.suinsName),
    });
  }

  const [passport] = tx.moveCall({
    target: `${options.packageId}::agent_passport::create`,
    arguments: [
      tx.pure.vector('u8', Array.from(new TextEncoder().encode(options.suinsName))),
      tx.pure.address(options.runtimeWallet),
    ],
  });

  tx.transferObjects([passport], options.recipient);
  return tx;
}
