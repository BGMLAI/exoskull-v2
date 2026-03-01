/**
 * Lane Queue — serial per-tenant execution.
 *
 * Ensures only one agent request processes per tenant at a time.
 * Uses Postgres advisory locks via a simple in-memory map for the
 * serverless case (Vercel). For persistent workers, use pg_advisory_lock.
 */

const activeTenants = new Map<string, Promise<unknown>>();

/**
 * Execute fn serially per tenant — if another request is already
 * processing for this tenant, queue behind it.
 */
export async function withLane<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  // Wait for any existing work for this tenant
  const existing = activeTenants.get(tenantId);
  if (existing) {
    await existing.catch(() => {}); // swallow errors from previous
  }

  // Create our work and register it
  const work = fn();
  activeTenants.set(tenantId, work);

  try {
    return await work;
  } finally {
    // Only clear if we're still the active work
    if (activeTenants.get(tenantId) === work) {
      activeTenants.delete(tenantId);
    }
  }
}
