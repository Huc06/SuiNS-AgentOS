import { ImageResponse } from 'next/og';

import { resolveAgentPageData } from '../../../lib/registry-resolve';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OGImage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const data = await resolveAgentPageData(name);

  const agentName = data?.resolved.agent.suinsName ?? `@${name}`;
  const status = data?.resolved.agent.status ?? 'unknown';
  const network = data?.resolved.agent.network ?? 'testnet';
  const skillCount = data?.skills.length ?? 0;

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
          width: '100%',
          height: '100%',
          backgroundColor: '#FAF8F5',
          padding: '80px',
          fontFamily: 'monospace',
        }}
      >
        {/* Top badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '24px',
          }}
        >
          <div
            style={{
              backgroundColor: '#6800FF',
              color: '#FAF8F5',
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: 700,
              textTransform: 'uppercase' as const,
              border: '2px solid #000',
            }}
          >
            AGENT PASSPORT
          </div>
          <div
            style={{
              border: '2px solid #000',
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: 700,
              textTransform: 'uppercase' as const,
            }}
          >
            {network}
          </div>
        </div>

        {/* Name */}
        <div
          style={{
            fontSize: '64px',
            fontWeight: 700,
            color: '#000',
            marginBottom: '16px',
            lineHeight: 1.1,
          }}
        >
          {agentName}
        </div>

        {/* Stats row */}
        <div
          style={{
            display: 'flex',
            gap: '32px',
            marginTop: '24px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '14px', color: '#494457', textTransform: 'uppercase' as const }}>
              Status
            </span>
            <span style={{ fontSize: '24px', fontWeight: 700, color: status === 'active' ? '#166534' : '#ba1a1a' }}>
              {status}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '14px', color: '#494457', textTransform: 'uppercase' as const }}>
              Skills
            </span>
            <span style={{ fontSize: '24px', fontWeight: 700 }}>
              {skillCount}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            position: 'absolute',
            bottom: '40px',
            left: '80px',
            fontSize: '16px',
            color: '#494457',
          }}
        >
          SuiNS AgentOS — Discoverable agents on Sui
        </div>

        {/* Border decoration */}
        <div
          style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            right: '20px',
            bottom: '20px',
            border: '4px solid #000',
            pointerEvents: 'none',
          }}
        />
      </div>
    ),
    { ...size },
  );
}
