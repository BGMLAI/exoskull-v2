/**
 * Event Store — append-only event log for crash recovery and debugging.
 *
 * Every agent action = immutable event. Enables:
 * - Crash recovery (replay from last checkpoint)
 * - Full trace debugging
 * - Cost tracking per session
 */

import type { Event, EventInsert, EventKind, MessageChannel } from "@exoskull/types";
import { appendEvent, appendEvents, getSessionEvents, getNextSeq } from "@exoskull/store";

export class EventStore {
  private sessionId: string;
  private tenantId: string;
  private channel: MessageChannel;
  private seq: number;
  private buffer: EventInsert[] = [];

  constructor(tenantId: string, sessionId: string, channel: MessageChannel) {
    this.tenantId = tenantId;
    this.sessionId = sessionId;
    this.channel = channel;
    this.seq = 0;
  }

  async init(): Promise<void> {
    this.seq = await getNextSeq(this.sessionId);
  }

  emit(kind: EventKind, data: Record<string, unknown>, tokens?: { in: number; out: number; costCents: number }): EventInsert {
    const event: EventInsert = {
      tenant_id: this.tenantId,
      session_id: this.sessionId,
      seq: this.seq++,
      kind,
      data,
      channel: this.channel,
      tokens_in: tokens?.in ?? null,
      tokens_out: tokens?.out ?? null,
      cost_cents: tokens?.costCents ?? null,
    };
    this.buffer.push(event);
    return event;
  }

  async flush(): Promise<Event[]> {
    if (this.buffer.length === 0) return [];
    const events = [...this.buffer];
    this.buffer = [];
    return appendEvents(events);
  }

  async replay(): Promise<Event[]> {
    return getSessionEvents(this.sessionId);
  }

  getBuffer(): EventInsert[] {
    return [...this.buffer];
  }
}
