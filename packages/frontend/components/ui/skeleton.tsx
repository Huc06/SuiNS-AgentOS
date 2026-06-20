'use client';

import { type HTMLAttributes } from 'react';

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Width class (e.g., 'w-32', 'w-full'). Defaults to 'w-full'. */
  width?: string;
  /** Height class (e.g., 'h-4', 'h-6'). Defaults to 'h-4'. */
  height?: string;
}

/**
 * A neo-brutalist skeleton loader with pulse animation.
 * Uses the project's surface-container + 2px black border + offset shadow.
 * Respects `prefers-reduced-motion` — disables pulse for users who opt out.
 */
export function Skeleton({ width = 'w-full', height = 'h-4', className = '', ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse border-2 border-pure-black bg-surface-container motion-reduce:animate-none ${width} ${height} ${className}`}
      {...props}
    />
  );
}

/** A skeleton card matching the AgentCard shape for loading grids. */
export function SkeletonCard() {
  return (
    <div
      aria-hidden="true"
      className="animate-pulse border-2 border-pure-black bg-white p-6 neo-shadow motion-reduce:animate-none"
    >
      {/* Icon + network badge */}
      <div className="mb-6 flex items-start justify-between">
        <div className="h-10 w-10 border-2 border-surface-dim bg-surface-container" />
        <div className="h-5 w-16 border-2 border-surface-dim bg-surface-container" />
      </div>
      {/* Name */}
      <div className="mb-2 h-6 w-3/4 bg-surface-container" />
      {/* Version */}
      <div className="mb-4 h-4 w-1/3 bg-surface-container" />
      {/* Metric row */}
      <div className="flex items-center justify-between border-t-2 border-pure-black/5 pt-4">
        <div className="h-4 w-20 bg-surface-container" />
        <div className="h-5 w-5 bg-surface-container" />
      </div>
    </div>
  );
}

/** A row skeleton for skill/list items. */
export function SkeletonRow() {
  return (
    <div
      aria-hidden="true"
      className="animate-pulse border-2 border-pure-black bg-white p-4 motion-reduce:animate-none"
    >
      <div className="flex items-center gap-4">
        <div className="h-8 w-8 bg-surface-container" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-1/2 bg-surface-container" />
          <div className="h-3 w-1/4 bg-surface-container" />
        </div>
      </div>
    </div>
  );
}

/** A branded empty state panel with dashed border and CTA. */
export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="col-span-full border-2 border-dashed border-pure-black bg-white px-8 py-12 text-center">
      <h3 className="font-display text-lg font-bold text-on-surface">{title}</h3>
      {description && (
        <p className="mt-2 font-mono text-sm text-on-surface-variant">{description}</p>
      )}
      {actionLabel && actionHref && (
        <a
          href={actionHref}
          className="mt-6 inline-block border-2 border-pure-black bg-electric-purple px-6 py-3 font-mono text-sm font-bold text-off-white neo-shadow transition-all hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[8px_8px_0_0_#000]"
        >
          {actionLabel}
        </a>
      )}
    </div>
  );
}

/** An error alert box matching the neo-brutalist error pattern. */
export function ErrorAlert({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="border-2 border-error bg-red-50 px-4 py-3 neo-shadow"
    >
      <p className="font-mono text-sm font-bold text-error">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 border-2 border-error bg-white px-3 py-1 font-mono text-xs font-bold text-error transition-colors hover:bg-error hover:text-white"
        >
          Try again
        </button>
      )}
    </div>
  );
}
