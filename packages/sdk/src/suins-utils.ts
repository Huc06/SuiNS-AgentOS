/**
 * Utilities for formatting SuiNS skill subnames.
 *
 * A skill's fully-qualified SuiNS name is `{skillName}.{agentName}.sui`. When
 * the provided `agentName` already carries the `.sui` suffix it is reused
 * as-is, otherwise the suffix is appended.
 *
 * Examples:
 *   formatSkillSubname("trade", "alpha.sui") === "trade.alpha.sui"
 *   formatSkillSubname("trade", "alpha")     === "trade.alpha.sui"
 *
 * See Property 10 (SuiNS skill subname qualification).
 */
export function formatSkillSubname(
  skillName: string,
  agentName: string,
): string {
  const skill = skillName.trim().replace(/^\.+|\.+$/g, "");
  let agent = agentName.trim().replace(/^\.+|\.+$/g, "");
  if (!agent.endsWith(".sui")) {
    agent = `${agent}.sui`;
  }
  return `${skill}.${agent}`;
}
