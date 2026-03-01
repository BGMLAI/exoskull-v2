import type { Blob, BlobInsert, BlobUpdate } from "@exoskull/types";
import { getServiceClient } from "./client";

export async function insertBlob(blob: BlobInsert): Promise<Blob> {
  const { data, error } = await getServiceClient()
    .from("blobs")
    .insert(blob)
    .select("*")
    .single();

  if (error) throw error;
  return data!;
}

export async function getBlob(id: string): Promise<Blob | null> {
  const { data, error } = await getServiceClient()
    .from("blobs")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data;
}

export async function listBlobs(tenantId: string, kind?: string): Promise<Blob[]> {
  let query = getServiceClient()
    .from("blobs")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (kind) {
    query = query.eq("kind", kind);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function updateBlob(id: string, update: BlobUpdate): Promise<Blob> {
  const { data, error } = await getServiceClient()
    .from("blobs")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data!;
}
