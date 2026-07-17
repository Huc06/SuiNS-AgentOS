type TxClient = {
  waitForTransaction: (input: { digest: string }) => Promise<unknown>;
  getTransactionBlock: (input: {
    digest: string;
    options?: { showObjectChanges?: boolean };
  }) => Promise<{
    objectChanges?: Array<{
      type: string;
      objectType?: string;
      objectId?: string;
    }>;
  }>;
};

const PASSPORT_CONFIRMATION_TIMEOUT_MS = 10_000;

export async function resolvePassportFromDigest(
  client: TxClient,
  digest: string,
  packageId: string,
): Promise<{ passportObjectId?: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      client.waitForTransaction({ digest }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Timed out waiting for transaction confirmation")),
          PASSPORT_CONFIRMATION_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }

  const block = await client.getTransactionBlock({
    digest,
    options: { showObjectChanges: true },
  });

  const suffix = `${packageId}::agent_passport::AgentPassport`;
  const created = block.objectChanges?.find(
    (change) =>
      change.type === 'created' &&
      'objectType' in change &&
      typeof change.objectType === 'string' &&
      change.objectType.includes(suffix),
  );

  if (created?.type === 'created' && 'objectId' in created) {
    return { passportObjectId: created.objectId };
  }

  return {};
}
