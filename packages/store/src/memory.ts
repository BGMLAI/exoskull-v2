import type { Memory, MemoryInsert, MemoryUpdate, MemoryKind, MemorySearchResult } from "@exoskull/types";
import { getServiceClient } from "./client";

export async function insertMemory(memory: MemoryInsert): Promise<Memory> {
  const row: Record<string, unknown> = { ...memory };
  if (memory.embedding) {
    row.embedding = JSON.stringify(memory.embedding);
  }

  const { data, error } = await getServiceClient()
    .from("memory")
    .insert(row)
    .select("*")
    .single();

  if (error) throw error;
  return data!;
}

export async function updateMemory(id: string, update: MemoryUpdate): Promise<Memory> {
  const row: Record<string, unknown> = { ...update };
  if (update.embedding) {
    row.embedding = JSON.stringify(update.embedding);
  }

  const { data, error } = await getServiceClient()
    .from("memory")
    .update(row)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data!;
}

export async function getMemoryByKind(tenantId: string, kind: MemoryKind): Promise<Memory[]> {
  const { data, error } = await getServiceClient()
    .from("memory")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("kind", kind)
    .order("importance", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getSoulMemory(tenantId: string): Promise<Memory | null> {
  const { data, error } = await getServiceClient()
    .from("memory")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("kind", "soul")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data;
}

export async function getWorkingMemory(tenantId: string): Promise<Memory | null> {
  const { data, error } = await getServiceClient()
    .from("memory")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("kind", "working_memory")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data;
}

export async function searchMemoryVector(
  tenantId: string,
  embedding: number[],
  limit = 10,
  threshold = 0.3,
): Promise<MemorySearchResult[]> {
  const { data, error } = await getServiceClient()
    .rpc("search_memory", {
      p_tenant_id: tenantId,
      p_embedding: embedding,
      p_limit: limit,
      p_threshold: threshold,
    });

  if (error) throw error;
  return data ?? [];
}

export async function searchMemoryKeyword(
  tenantId: string,
  query: string,
  limit = 10,
): Promise<Memory[]> {
  const { data, error } = await getServiceClient()
    .from("memory")
    .select("*")
    .eq("tenant_id", tenantId)
    .ilike("content", `%${query}%`)
    .order("importance", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

export async function deleteExpiredMemory(tenantId: string): Promise<number> {
  const { data, error } = await getServiceClient()
    .from("memory")
    .delete()
    .eq("tenant_id", tenantId)
    .lt("expires_at", new Date().toISOString())
    .select("id");

  if (error) throw error;
  return data?.length ?? 0;
}

export async function touchMemory(id: string): Promise<void> {
  await getServiceClient()
    .from("memory")
    .update({ accessed_at: new Date().toISOString() })
    .eq("id", id);
}
