'use client';

import { ConnectButton } from '@mysten/dapp-kit';
import Link from 'next/link';
import { useCallback, useEffect, useRef } from 'react';

type NavItem =
  | { href: string; label: string; external?: false }
  | { href: string; label: string; external: true };

interface MobileNavDrawerProps {
  open: boolean;
  onClose: () => void;
  nav: NavItem[];
  activeHref?: string;
}

/**
 * Full-screen mobile nav drawer with neo-brutalist styling.
 * Features: focus trap, Escape to close, body scroll lock, backdrop click-out.
 */
export function MobileNavDrawer({ open, onClose, nav, activeHref }: MobileNavDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Focus trap + Escape handler
  useEffect(() => {
    if (!open) return;

    // Focus the close button when drawer opens
    closeButtonRef.current?.focus();

    // Lock body scroll
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      // Simple focus trap within the drawer
      if (e.key === 'Tab' && drawerRef.current) {
        const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = original;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] md:hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-pure-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col border-l-2 border-pure-black bg-off-white"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-pure-black px-6 py-4">
          <span className="font-display text-lg font-black uppercase tracking-tighter">
            Menu
          </span>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center border-2 border-pure-black bg-white font-mono text-lg font-bold"
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 space-y-1 px-6 py-6">
          {nav.map((item) =>
            item.external ? (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
                className="block border-2 border-pure-black bg-white px-4 py-3 font-mono text-sm font-bold text-on-surface-variant transition-colors hover:bg-surface-container"
              >
                {item.label} ↗
              </a>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={
                  activeHref === item.href
                    ? 'block border-2 border-electric-purple bg-soft-lavender px-4 py-3 font-mono text-sm font-bold text-electric-purple neo-shadow'
                    : 'block border-2 border-pure-black bg-white px-4 py-3 font-mono text-sm font-bold text-on-surface transition-colors hover:bg-surface-container'
                }
              >
                {item.label}
              </Link>
            ),
          )}
        </nav>

        {/* Wallet connect */}
        <div className="border-t-2 border-pure-black px-6 py-6 [&_button]:!w-full [&_button]:!font-mono [&_button]:!text-sm [&_button]:!font-bold [&_button]:!border-2 [&_button]:!border-pure-black [&_button]:!neo-shadow">
          <p className="mb-3 font-mono text-xs font-bold uppercase text-on-surface-variant">
            Wallet
          </p>
          <ConnectButton />
        </div>
      </div>
    </div>
  );
}
