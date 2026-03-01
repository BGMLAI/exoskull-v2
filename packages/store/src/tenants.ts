import type { Tenant, TenantInsert, TenantUpdate } from "@exoskull/types";
import { getServiceClient } from "./client";

export async function getTenant(id: string): Promise<Tenant | null> {
  const { data, error } = await getServiceClient()
    .from("tenants")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data;
}

export async function getTenantByAuth(authId: string): Promise<Tenant | null> {
  const { data, error } = await getServiceClient()
    .from("tenants")
    .select("*")
    .eq("auth_id", authId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data;
}

export async function getOrCreateTenant(authId: string, email?: string, name?: string): Promise<Tenant> {
  const existing = await getTenantByAuth(authId);
  if (existing) return existing;

  const { data, error } = await getServiceClient()
    .from("tenants")
    .insert({ auth_id: authId, email, name } satisfies TenantInsert)
    .select("*")
    .single();

  if (error) throw error;
  return data!;
}

export async function updateTenant(id: string, update: TenantUpdate): Promise<Tenant> {
  const { data, error } = await getServiceClient()
    .from("tenants")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data!;
}
