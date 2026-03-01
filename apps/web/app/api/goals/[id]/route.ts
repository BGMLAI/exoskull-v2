import { NextRequest } from "next/server";
import { createSupabaseServer } from "../../../../lib/supabase/server";
import { getOrCreateTenant, updateGoal, completeGoal, getGoal } from "@exoskull/store";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const tenant = await getOrCreateTenant(user.id, user.email);
  const body = await req.json();

  // Verify goal belongs to tenant
  const existing = await getGoal(id);
  if (!existing || existing.tenant_id !== tenant.id) {
    return new Response("Not found", { status: 404 });
  }

  if (body.status === "completed") {
    const goal = await completeGoal(id);
    return Response.json(goal);
  }

  const goal = await updateGoal(id, body);
  return Response.json(goal);
}
