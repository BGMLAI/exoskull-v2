import type { QueueItem, QueueInsert, QueueUpdate, QueueKind } from "@exoskull/types";
import { getServiceClient } from "./client";

export async function enqueue(item: QueueInsert): Promise<QueueItem> {
  const { data, error } = await getServiceClient()
    .from("queue")
    .insert(item)
    .select("*")
    .single();

  if (error) throw error;
  return data!;
}

export async function claimItem(kinds?: QueueKind[]): Promise<QueueItem | null> {
  const { data, error } = await getServiceClient()
    .rpc("claim_queue_item", { p_kinds: kinds ?? null });

  if (error) throw error;
  if (!data || data.length === 0) return null;
  return data[0];
}

export async function updateQueueItem(id: string, update: QueueUpdate): Promise<QueueItem> {
  const { data, error } = await getServiceClient()
    .from("queue")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data!;
}

export async function completeQueueItem(id: string, result?: Record<string, unknown>): Promise<void> {
  await updateQueueItem(id, {
    status: "completed",
    completed_at: new Date().toISOString(),
    payload: result ?? {},
  });
}

export async function failQueueItem(id: string, error: string): Promise<void> {
  const item = await getServiceClient()
    .from("queue")
    .select("attempts, max_attempts")
    .eq("id", id)
    .single();

  const attempts = (item.data?.attempts ?? 0) + 1;
  const maxAttempts = item.data?.max_attempts ?? 3;

  await updateQueueItem(id, {
    status: attempts >= maxAttempts ? "dead_letter" : "pending",
    attempts,
    last_error: error,
    claimed_by: null,
  });
}

export async function getPendingItems(
  tenantId: string,
  kinds?: QueueKind[],
  limit = 20,
): Promise<QueueItem[]> {
  let query = getServiceClient()
    .from("queue")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .order("priority", { ascending: false })
    .order("scheduled_for", { ascending: true })
    .limit(limit);

  if (kinds && kinds.length > 0) {
    query = query.in("kind", kinds);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function scheduleRecurring(
  tenantId: string,
  kind: QueueKind,
  payload: Record<string, unknown>,
  recurrence: string,
  priority = 5,
): Promise<QueueItem> {
  return enqueue({
    tenant_id: tenantId,
    kind,
    priority,
    payload,
    scheduled_for: new Date().toISOString(),
    recurrence,
    max_attempts: 3,
    claimed_by: null,
    last_error: null,
    completed_at: null,
  });
}

export async function cleanupDeadLetters(olderThanDays = 7): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);

  const { data, error } = await getServiceClient()
    .from("queue")
    .delete()
    .eq("status", "dead_letter")
    .lt("created_at", cutoff.toISOString())
    .select("id");

  if (error) throw error;
  return data?.length ?? 0;
}
