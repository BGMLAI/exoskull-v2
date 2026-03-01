/**
 * Gateway Router — normalizes inbound messages from any channel into AgentRequest.
 */

import type { AgentRequest, MessageChannel } from "@exoskull/types";

export interface InboundMessage {
  tenantId: string;
  sessionId: string;
  message: string;
  channel: MessageChannel;
  metadata?: Record<string, unknown>;
}

export function routeMessage(msg: InboundMessage): AgentRequest {
  return {
    tenantId: msg.tenantId,
    sessionId: msg.sessionId,
    userMessage: msg.message,
    channel: msg.channel,
    mode: "interactive",
  };
}
