import type { Tool, ToolInsert } from "@exoskull/types";
import { getServiceClient } from "./client";

export async function registerTool(tool: ToolInsert): Promise<Tool> {
  const { data, error } = await getServiceClient()
    .from("tools")
    .upsert(tool, { onConflict: "tenant_id,slug" })
    .select("*")
    .single();

  if (error) throw error;
  return data!;
}

export async function getToolBySlug(tenantId: string | null, slug: string): Promise<Tool | null> {
  let query = getServiceClient()
    .from("tools")
    .select("*")
    .eq("slug", slug);

  if (tenantId) {
    query = query.or(`tenant_id.eq.${tenantId},tenant_id.is.null`);
  } else {
    query = query.is("tenant_id", null);
  }

  const { data, error } = await query.limit(1).single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data;
}

export async function getEnabledTools(tenantId: string): Promise<Tool[]> {
  const { data, error } = await getServiceClient()
    .from("tools")
    .select("*")
    .eq("enabled", true)
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .order("usage_count", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function incrementToolUsage(id: string): Promise<void> {
  const { error } = await getServiceClient()
    .rpc("increment_tool_usage", { tool_id: id })
    .single();

  // Fallback if RPC doesn't exist
  if (error) {
    const tool = await getServiceClient().from("tools").select("usage_count").eq("id", id).single();
    if (tool.data) {
      await getServiceClient()
        .from("tools")
        .update({ usage_count: (tool.data.usage_count ?? 0) + 1 })
        .eq("id", id);
    }
  }
}

export async function disableTool(id: string): Promise<void> {
  await getServiceClient()
    .from("tools")
    .update({ enabled: false })
    .eq("id", id);
}
