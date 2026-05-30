interface Props {
  params: Promise<{ name: string }>;
}

export default async function AgentDelegatePage({ params }: Props) {
  const { name } = await params;
  return (
    <main>
      <h1>Delegation: {name}</h1>
      <p>Sub-agent delegation manager.</p>
    </main>
  );
}
