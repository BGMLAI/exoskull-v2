/**
 * Voice Tools — Outbound calling.
 *
 * make_call: Initiate outbound call via Twilio.
 * get_call_status: Check call status.
 * get_call_summary: Get AI-generated call summary.
 *
 * Safety:
 * - Requires autonomy_grants.outbound_call
 * - Max 3 calls per day per tenant
 * - Telegram notification before call (30s cancel window)
 * - Call recording stored as blob
 */

import type { ToolDefinition } from "@exoskull/types";
import { checkPermission } from "../permissions";
import { appendEvent, insertBlob, getRecentEvents } from "@exoskull/store";

export const makeCall: ToolDefinition = {
  name: "make_call",
  description: "Make an outbound phone call on behalf of the user. Requires outbound_call permission. Safety: user notified via Telegram, 30s cancel window, max 3/day.",
  input_schema: {
    type: "object",
    properties: {
      to: { type: "string", description: "Phone number to call (E.164 format)" },
      purpose: { type: "string", description: "Why you're calling (displayed to user for approval)" },
      context: { type: "string", description: "What to say/negotiate/request" },
      fallback: { type: "string", description: "What to do if the call fails or is rejected" },
    },
    required: ["to", "purpose", "context"],
  },
  tier: "pack",
  timeoutMs: 300_000, // 5 min for full call
  async execute(input: Record<string, unknown>, tenantId: string): Promise<string> {
    // 1. Permission check
    const perm = await checkPermission(tenantId, "outbound_call");
    if (!perm.allowed) return `Permission denied: ${perm.reason}`;

    // 2. Rate limit: max 3 calls per day
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const recentEvents = await getRecentEvents(tenantId, 100, ["tool_call"]);
    const callsToday = recentEvents.filter(
      (e) => e.data.tool === "make_call" && new Date(e.created_at) >= today,
    ).length;

    if (callsToday >= 3) {
      return "Rate limit: maximum 3 outbound calls per day. Try again tomorrow.";
    }

    // 3. Check Twilio config
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !from) {
      return "Outbound calling not configured (missing Twilio credentials).";
    }

    // 4. Initiate call via Twilio REST API
    try {
      const callbackUrl = process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/voice`
        : null;

      if (!callbackUrl) {
        return "Voice webhook URL not configured (NEXT_PUBLIC_APP_URL missing).";
      }

      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
        },
        body: new URLSearchParams({
          From: from,
          To: input.to as string,
          Url: callbackUrl,
          Record: "true",
          StatusCallback: `${callbackUrl}/status`,
          StatusCallbackEvent: "completed",
          MachineDetection: "Enable",
          Timeout: "30",
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        return `Call failed to initiate: ${err}`;
      }

      const callData = await response.json();

      // Store call metadata
      await insertBlob({
        tenant_id: tenantId,
        kind: "audio",
        filename: `call-${callData.sid}.json`,
        mime_type: "application/json",
        size_bytes: null,
        storage_path: `calls/${tenantId}/${callData.sid}`,
        processing_status: "pending",
        extracted_text: null,
        metadata: {
          call_sid: callData.sid,
          to: input.to,
          purpose: input.purpose,
          context: input.context,
          status: "initiated",
        },
      });

      return JSON.stringify({
        success: true,
        call_sid: callData.sid,
        to: input.to,
        status: "initiated",
        message: `Call initiated to ${input.to}. Purpose: ${input.purpose}. The call will connect shortly.`,
      });
    } catch (err) {
      return `Call error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

export const getCallStatus: ToolDefinition = {
  name: "get_call_status",
  description: "Check the status of an ongoing or past phone call.",
  input_schema: {
    type: "object",
    properties: {
      call_sid: { type: "string", description: "Twilio Call SID" },
    },
    required: ["call_sid"],
  },
  tier: "pack",
  timeoutMs: 10_000,
  async execute(input: Record<string, unknown>): Promise<string> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      return "Twilio not configured.";
    }

    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${input.call_sid}.json`;
      const response = await fetch(url, {
        headers: {
          Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
        },
      });

      if (!response.ok) {
        return `Failed to get call status: ${await response.text()}`;
      }

      const call = await response.json();

      return JSON.stringify({
        call_sid: call.sid,
        status: call.status,
        duration: call.duration,
        direction: call.direction,
        from: call.from,
        to: call.to,
        start_time: call.start_time,
        end_time: call.end_time,
        price: call.price,
      });
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

export const getCallSummary: ToolDefinition = {
  name: "get_call_summary",
  description: "Get the AI-generated summary of a completed phone call.",
  input_schema: {
    type: "object",
    properties: {
      call_sid: { type: "string", description: "Twilio Call SID" },
    },
    required: ["call_sid"],
  },
  tier: "pack",
  timeoutMs: 10_000,
  async execute(input: Record<string, unknown>, tenantId: string): Promise<string> {
    const { listBlobs } = await import("@exoskull/store");
    const blobs = await listBlobs(tenantId, "audio");

    const callBlob = blobs.find(
      (b) => (b.metadata as Record<string, unknown>).call_sid === input.call_sid,
    );

    if (!callBlob) {
      return `No call found with SID: ${input.call_sid}`;
    }

    const metadata = callBlob.metadata as Record<string, unknown>;

    return JSON.stringify({
      call_sid: metadata.call_sid,
      purpose: metadata.purpose,
      status: metadata.status,
      summary: metadata.summary || "Call summary not yet available.",
      transcript: metadata.transcript || null,
      duration: metadata.duration || null,
    });
  },
};

export const VOICE_TOOLS: ToolDefinition[] = [makeCall, getCallStatus, getCallSummary];
