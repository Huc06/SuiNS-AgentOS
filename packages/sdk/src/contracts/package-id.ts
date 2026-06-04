/** Placeholder until @mysten/codegen wires published package id. */
export const PACKAGE_PLACEHOLDER = '@agentos/contracts' as const;

/** Resolve Move package id from config, env, or MVR placeholder. */
export function resolveMovePackageId(packageId?: string): string {
  const fromEnv =
    typeof process !== 'undefined' && process.env?.AGENTOS_PACKAGE_ID
      ? process.env.AGENTOS_PACKAGE_ID.trim()
      : '';
  return packageId?.trim() || fromEnv || PACKAGE_PLACEHOLDER;
}

export function moveTarget(
  packageId: string | undefined,
  module: string,
  functionName: string,
): string {
  return `${resolveMovePackageId(packageId)}::${module}::${functionName}`;
}
