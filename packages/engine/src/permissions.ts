/**
 * Permissions — autonomy grant checking.
 *
 * ExoSkull acts autonomously WITHIN granted permissions.
 * Asks user only for actions that require explicit approval.
 */

import type { Tenant, AutonomyGrants } from "@exoskull/types";
import { getTenant } from "@exoskull/store";

export type PermissionAction =
  | "send_sms"
  | "send_email"
  | "outbound_call"
  | "build_app"
  | "connect_integration"
  | "spend_money"
  | "delete_data"
  | "deploy_production"
  | "contact_stranger";

// Actions that ALWAYS require approval regardless of grants
const ALWAYS_ASK: PermissionAction[] = [
  "spend_money",
  "delete_data",
  "deploy_production",
  "contact_stranger",
];

// Actions the agent can do without any grants
const ALWAYS_ALLOWED: string[] = [
  "define_goal",
  "add_task",
  "complete_task",
  "remember",
  "search_brain",
  "check_goals",
  "log_goal_progress",
  "search_web",
  "build_app", // building is fine, deploying to prod requires approval
];

export interface PermissionCheck {
  allowed: boolean;
  reason?: string;
}

export async function checkPermission(
  tenantId: string,
  action: PermissionAction,
): Promise<PermissionCheck> {
  // Always-ask actions
  if (ALWAYS_ASK.includes(action)) {
    return { allowed: false, reason: `Action "${action}" requires explicit user approval.` };
  }

  const tenant = await getTenant(tenantId);
  if (!tenant) return { allowed: false, reason: "Tenant not found" };

  // Check grants
  if (tenant.autonomy_grants[action] === true) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `Permission "${action}" not granted. Ask the user to enable it.`,
  };
}

export function isToolAllowed(toolName: string): boolean {
  return ALWAYS_ALLOWED.includes(toolName);
}

export function getRequiredPermission(toolName: string): PermissionAction | null {
  const mapping: Record<string, PermissionAction> = {
    send_sms: "send_sms",
    send_email: "send_email",
    make_call: "outbound_call",
    deploy_app: "deploy_production",
  };
  return mapping[toolName] ?? null;
}
