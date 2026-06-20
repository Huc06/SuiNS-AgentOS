'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  { href: '/create', icon: '⬡', label: 'Workspace', key: 'workspace' },
  { href: '/explore', icon: '◎', label: 'Explore', key: 'explore' },
  { href: '/', icon: '◈', label: 'Home', key: 'home' },
] as const;

/**
 * Vertical icon sidebar — fixed left, 56px wide.
 * Matches the Fynt/Talus workspace pattern.
 */
export function WorkspaceSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-14 shrink-0 flex-col items-center border-r-2 border-pure-black bg-on-surface py-4">
      {/* Logo */}
      <Link
        href="/"
        className="mb-8 flex h-9 w-9 items-center justify-center bg-electric-purple font-display text-xs font-bold text-off-white"
      >
        AG
      </Link>

      {/* Nav icons */}
      <nav className="flex flex-1 flex-col items-center gap-2">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.key}
              href={item.href}
              title={item.label}
              className={`flex h-10 w-10 items-center justify-center font-mono text-lg transition-colors ${
                active
                  ? 'bg-electric-purple text-off-white'
                  : 'text-off-white/50 hover:bg-off-white/10 hover:text-off-white'
              }`}
            >
              {item.icon}
            </Link>
          );
        })}
      </nav>

      {/* Bottom: wallet indicator */}
      <div className="mt-auto flex h-10 w-10 items-center justify-center text-off-white/30" title="Wallet">
        ●
      </div>
    </aside>
  );
}
