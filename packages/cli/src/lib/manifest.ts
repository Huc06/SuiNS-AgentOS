import { readFileSync } from 'node:fs';

import type { SkillManifest } from '@agentos-sui/sdk';

export function readManifestFile(filePath: string): SkillManifest {
  const raw = JSON.parse(readFileSync(filePath, 'utf8')) as SkillManifest;
  if (raw.manifestType !== 'sui-agent-skill/v1') {
    throw new Error(`Invalid manifestType: expected sui-agent-skill/v1`);
  }
  if (!raw.name || !raw.version) {
    throw new Error('Manifest must include name and version');
  }
  return raw;
}
