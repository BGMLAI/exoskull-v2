import { createSupabaseServer } from "../../../lib/supabase/server";
import { getOrCreateTenant, listBlobs } from "@exoskull/store";

export async function GET() {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json([], { status: 401 });

    const tenant = await getOrCreateTenant(user.id, user.email);
    const blobs = await listBlobs(tenant.id);

    return Response.json(blobs.map(b => ({
      id: b.id,
      filename: b.filename,
      size_bytes: b.size_bytes,
      kind: b.kind,
      created_at: b.created_at,
    })));
  } catch (err) {
    console.error("[api/files] Error:", err);
    return Response.json([], { status: 500 });
  }
}
