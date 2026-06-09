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

export async function resolvePassportFromDigest(
  client: TxClient,
  digest: string,
  packageId: string,
): Promise<{ passportObjectId?: string }> {
  await client.waitForTransaction({ digest });

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
