/**
 * Lightweight, dependency-free class-name joiner.
 *
 * Filters out falsy values and joins the remaining class strings with a
 * single space. Mirrors the common `cn` helper signature without pulling in
 * `clsx` / `tailwind-merge` (which are not dependencies of this package).
 */
export function cn(
  ...classes: (string | false | null | undefined)[]
): string {
  return classes.filter(Boolean).join(" ");
}
