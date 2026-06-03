import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const CLI = join(fileURLToPath(new URL('../dist/agentos.js', import.meta.url)));
const MANIFEST = join(fileURLToPath(new URL('../../../examples/skill.manifest.json', import.meta.url)));

function runAgentos(args: string[], cwd: string): string {
  return execFileSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
}

describe('agentos CLI distribution flow', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentos-cli-'));

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('init → create agent → publish skill → resolve', () => {
    runAgentos(['init', '--no-seed'], dir);

    const registryPath = join(dir, '.agentos', 'registry.json');
    expect(existsSync(registryPath)).toBe(true);

    const createOut = JSON.parse(
      runAgentos(['agent', 'create', 'flow-test.sui', '--wallet', '0xFLOW', '--json'], dir),
    );
    expect(createOut.agent.suinsName).toBe('flow-test.sui');
    expect(createOut.dashboardUrl).toContain('/agent/flow-test');

    const publishOut = JSON.parse(
      runAgentos(
        ['skill', 'publish', MANIFEST, '--agent', 'flow-test.sui', '--json'],
        dir,
      ),
    );
    expect(publishOut.skill.skillId).toBe('web-search');

    const resolveOut = JSON.parse(
      runAgentos(['agent', 'resolve', 'flow-test.sui', '--json'], dir),
    );
    expect(resolveOut.skills).toHaveLength(1);
    expect(resolveOut.skills[0].mvrPackage).toBe('@my-agent/web-search');
  });

  it('dry-run prepares transaction without requiring on-chain package', () => {
    const out = runAgentos(
      [
        'agent',
        'create',
        'dry.sui',
        '--wallet',
        '0x1',
        '--dry-run',
        '--json',
      ],
      dir,
    );
    const parsed = JSON.parse(out);
    expect(parsed.mode).toBe('dry-run');
    expect(parsed.kind).toBe('createAgent');
    expect(parsed.note).toContain('packageId');
  });

  it('persists registry to disk', () => {
    const registryPath = join(dir, '.agentos', 'registry.json');
    const data = JSON.parse(readFileSync(registryPath, 'utf8'));
    expect(data.agents.some((a: { suinsName: string }) => a.suinsName === 'flow-test.sui')).toBe(
      true,
    );
  });
});
