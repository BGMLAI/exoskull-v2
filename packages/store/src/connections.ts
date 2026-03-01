import type { Connection, ConnectionInsert, ConnectionUpdate } from "@exoskull/types";
import { getServiceClient } from "./client";

export async function upsertConnection(conn: ConnectionInsert): Promise<Connection> {
  const { data, error } = await getServiceClient()
    .from("connections")
    .upsert(conn, { onConflict: "tenant_id,provider" })
    .select("*")
    .single();

  if (error) throw error;
  return data!;
}

export async function getConnection(tenantId: string, provider: string): Promise<Connection | null> {
  const { data, error } = await getServiceClient()
    .from("connections")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("provider", provider)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data;
}

export async function listConnections(tenantId: string): Promise<Connection[]> {
  const { data, error } = await getServiceClient()
    .from("connections")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function updateConnection(
  tenantId: string,
  provider: string,
  update: ConnectionUpdate,
): Promise<Connection> {
  const { data, error } = await getServiceClient()
    .from("connections")
    .update(update)
    .eq("tenant_id", tenantId)
    .eq("provider", provider)
    .select("*")
    .single();

  if (error) throw error;
  return data!;
}

export async function deleteConnection(tenantId: string, provider: string): Promise<void> {
  await getServiceClient()
    .from("connections")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("provider", provider);
}
