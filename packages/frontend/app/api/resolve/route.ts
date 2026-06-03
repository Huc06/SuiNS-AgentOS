import { NextRequest, NextResponse } from 'next/server';
import { join } from 'node:path';

import { loadConfig, LocalRegistry, resolveRegistryPath } from '@agentos/sdk/node';

export const dynamic = 'force-dynamic';

function getRegistry(): LocalRegistry {
  const cwd = process.cwd();
  const config = loadConfig(cwd);
  const repoRoot = join(cwd, '../..');
  const registryPath =
    process.env.AGENTOS_REGISTRY_PATH ?? resolveRegistryPath(config, repoRoot);
  return LocalRegistry.open(registryPath);
}

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get('name');
  if (!name) {
    return NextResponse.json({ error: 'name query parameter is required' }, { status: 400 });
  }

  try {
    const registry = getRegistry();
    const resolved = registry.resolveAgent(name);
    if (!resolved) {
      return NextResponse.json({ error: `Agent not found: ${name}` }, { status: 404 });
    }
    return NextResponse.json(resolved);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'resolve failed' },
      { status: 500 },
    );
  }
}
