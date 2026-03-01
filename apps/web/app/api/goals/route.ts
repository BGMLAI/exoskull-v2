import { NextRequest } from "next/server";
import { createSupabaseServer } from "../../../lib/supabase/server";
import { getOrCreateTenant, getActiveGoalTree, insertGoal } from "@exoskull/store";
import type { GoalDepth } from "@exoskull/types";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const tenant = await getOrCreateTenant(user.id, user.email);
  const tree = await getActiveGoalTree(tenant.id);

  return Response.json(tree);
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const tenant = await getOrCreateTenant(user.id, user.email);
  const body = await req.json();

  const goal = await insertGoal({
    tenant_id: tenant.id,
    title: body.title,
    description: body.description || null,
    depth: (body.depth ?? 2) as GoalDepth,
    parent_id: body.parent_id || null,
    priority: body.priority ?? 5,
    status: "active",
    strategy: body.strategy || null,
    metrics: null,
    due_at: body.due_at || null,
    completed_at: null,
  });

  return Response.json(goal);
}
