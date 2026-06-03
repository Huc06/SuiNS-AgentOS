export type IconProps = { className?: string };

export function IconCopy({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="8" y="8" width="12" height="12" stroke="currentColor" strokeWidth="2" />
      <path d="M4 16V6a2 2 0 012-2h10" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function IconEdit({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 20h4l10-10-4-4L4 16v4zM14 6l4 4" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function IconPublish({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3v12M7 8l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
      <path d="M4 21h16" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function IconAdd({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function IconSkills({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 6h16v4H4zM4 14h10v4H4z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function IconChart({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function IconMeta({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="6" cy="6" r="2" fill="currentColor" />
      <circle cx="18" cy="6" r="2" fill="currentColor" />
      <circle cx="12" cy="18" r="2" fill="currentColor" />
      <path d="M8 6h8M7 8l5 8M17 8l-5 8" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function IconKey({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="8" cy="15" r="4" stroke="currentColor" strokeWidth="2" />
      <path d="M12 15h9M16 11l4 4-4 4" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function IconSettings({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

export function IconToken({ className = 'h-8 w-8' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
      <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function IconWallet({ className = 'h-8 w-8' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="6" width="18" height="12" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function IconSwap({ className = 'h-8 w-8' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 8h12l-3-3M20 16H8l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
    </svg>
  );
}
