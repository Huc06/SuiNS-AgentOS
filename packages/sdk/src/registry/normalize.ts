export function normalizeSuinsName(raw: string): string {
  const trimmed = raw.trim().toLowerCase().replace(/^@/, '');
  if (!trimmed) return '';
  return trimmed.endsWith('.sui') ? trimmed : `${trimmed}.sui`;
}

export function slugFromSuins(suinsName: string): string {
  return suinsName.replace(/\.sui$/, '').replace(/[^a-z0-9-]/g, '-');
}

export function shortObjectId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-6)}`;
}
