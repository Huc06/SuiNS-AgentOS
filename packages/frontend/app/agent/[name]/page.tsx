interface Props {
  params: Promise<{ name: string }>;
}

export default async function AgentPage({ params }: Props) {
  const { name } = await params;
  return (
    <main>
      <h1>Agent: {name}</h1>
      <p>AgentPassport viewer — wallet, skills, policy.</p>
    </main>
  );
}
