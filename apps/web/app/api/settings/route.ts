import { NextRequest } from "next/server";
import { createSupabaseServer } from "../../../lib/supabase/server";
import { getOrCreateTenant, getTenant, updateTenant } from "@exoskull/store";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const tenant = await getOrCreateTenant(user.id, user.email);
  return Response.json({
    id: tenant.id,
    name: tenant.name,
    email: tenant.email,
    phone: tenant.phone,
    timezone: tenant.timezone,
    settings: tenant.settings,
    autonomy_grants: tenant.autonomy_grants,
    channel_ids: tenant.channel_ids,
    onboarding_complete: tenant.onboarding_complete,
  });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const tenant = await getOrCreateTenant(user.id, user.email);
  const body = await req.json();

  const updated = await updateTenant(tenant.id, body);
  return Response.json(updated);
}
