interface Props {
  params: Promise<{ name: string }>;
}

export default async function AgentSkillsPage({ params }: Props) {
  const { name } = await params;
  return (
    <main>
      <h1>Skills: {name}</h1>
      <p>Skill tree with version graph.</p>
    </main>
  );
}
