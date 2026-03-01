import type { Goal, GoalInsert, GoalUpdate, GoalStatus, GoalNode } from "@exoskull/types";
import { getServiceClient } from "./client";

export async function insertGoal(goal: GoalInsert): Promise<Goal> {
  const { data, error } = await getServiceClient()
    .from("goals")
    .insert(goal)
    .select("*")
    .single();

  if (error) throw error;
  return data!;
}

export async function getGoal(id: string): Promise<Goal | null> {
  const { data, error } = await getServiceClient()
    .from("goals")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data;
}

export async function updateGoal(id: string, update: GoalUpdate): Promise<Goal> {
  const { data, error } = await getServiceClient()
    .from("goals")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data!;
}

export async function getGoalsByStatus(
  tenantId: string,
  status?: GoalStatus,
): Promise<Goal[]> {
  let query = getServiceClient()
    .from("goals")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true });

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getGoalTree(tenantId: string): Promise<GoalNode[]> {
  const allGoals = await getGoalsByStatus(tenantId);
  return buildTree(allGoals);
}

export async function getActiveGoalTree(tenantId: string): Promise<GoalNode[]> {
  const activeGoals = await getGoalsByStatus(tenantId, "active");
  return buildTree(activeGoals);
}

function buildTree(goals: Goal[]): GoalNode[] {
  const map = new Map<string, GoalNode>();
  const roots: GoalNode[] = [];

  for (const goal of goals) {
    map.set(goal.id, { ...goal, children: [] });
  }

  for (const goal of goals) {
    const node = map.get(goal.id)!;
    if (goal.parent_id && map.has(goal.parent_id)) {
      map.get(goal.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export async function getChildGoals(parentId: string): Promise<Goal[]> {
  const { data, error } = await getServiceClient()
    .from("goals")
    .select("*")
    .eq("parent_id", parentId)
    .order("priority", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getTasks(tenantId: string, status?: GoalStatus): Promise<Goal[]> {
  let query = getServiceClient()
    .from("goals")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("depth", 3)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true });

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function completeGoal(id: string): Promise<Goal> {
  return updateGoal(id, {
    status: "completed",
    progress: 1,
    completed_at: new Date().toISOString(),
  });
}

export async function updateGoalProgress(id: string, progress: number): Promise<Goal> {
  const clamped = Math.max(0, Math.min(1, progress));
  const update: GoalUpdate = { progress: clamped };
  if (clamped >= 1) {
    update.status = "completed";
    update.completed_at = new Date().toISOString();
  }
  return updateGoal(id, update);
}
