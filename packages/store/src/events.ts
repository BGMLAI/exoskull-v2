import type { Event, EventInsert, EventKind } from "@exoskull/types";
import { getServiceClient } from "./client";

export async function appendEvent(event: EventInsert): Promise<Event> {
  const { data, error } = await getServiceClient()
    .from("events")
    .insert(event)
    .select("*")
    .single();

  if (error) throw error;
  return data!;
}

export async function appendEvents(events: EventInsert[]): Promise<Event[]> {
  if (events.length === 0) return [];

  const { data, error } = await getServiceClient()
    .from("events")
    .insert(events)
    .select("*");

  if (error) throw error;
  return data!;
}

export async function getSessionEvents(sessionId: string): Promise<Event[]> {
  const { data, error } = await getServiceClient()
    .from("events")
    .select("*")
    .eq("session_id", sessionId)
    .order("seq", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getRecentEvents(
  tenantId: string,
  limit = 50,
  kinds?: EventKind[],
): Promise<Event[]> {
  let query = getServiceClient()
    .from("events")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (kinds && kinds.length > 0) {
    query = query.in("kind", kinds);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).reverse();
}

export async function getNextSeq(sessionId: string): Promise<number> {
  const { data, error } = await getServiceClient()
    .from("events")
    .select("seq")
    .eq("session_id", sessionId)
    .order("seq", { ascending: false })
    .limit(1);

  if (error) throw error;
  return (data?.[0]?.seq ?? 0) + 1;
}

export async function getEventCostSummary(
  tenantId: string,
  since?: string,
): Promise<{ totalTokensIn: number; totalTokensOut: number; totalCostCents: number }> {
  let query = getServiceClient()
    .from("events")
    .select("tokens_in, tokens_out, cost_cents")
    .eq("tenant_id", tenantId);

  if (since) {
    query = query.gte("created_at", since);
  }

  const { data, error } = await query;
  if (error) throw error;

  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let totalCostCents = 0;

  for (const row of data ?? []) {
    totalTokensIn += row.tokens_in ?? 0;
    totalTokensOut += row.tokens_out ?? 0;
    totalCostCents += Number(row.cost_cents ?? 0);
  }

  return { totalTokensIn, totalTokensOut, totalCostCents };
}
