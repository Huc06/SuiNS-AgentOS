import type { Metadata } from 'next';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'SuiNS AgentOS',
  description: 'Discoverable, permissioned, composable autonomous agents powered by SuiNS',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
