/**
 * Communication Tools — SMS, email, notifications.
 */

import type { ToolDefinition } from "@exoskull/types";
import { checkPermission } from "../permissions";
import { appendEvent } from "@exoskull/store";

export const sendSms: ToolDefinition = {
  name: "send_sms",
  description: "Send an SMS message to the user or a specified phone number. Requires send_sms permission for non-user numbers.",
  input_schema: {
    type: "object",
    properties: {
      to: { type: "string", description: "Phone number (E.164 format). Omit to send to user." },
      body: { type: "string", description: "Message text" },
    },
    required: ["body"],
  },
  tier: "pack",
  timeoutMs: 10_000,
  async execute(input: Record<string, unknown>, tenantId: string): Promise<string> {
    const perm = await checkPermission(tenantId, "send_sms");
    if (!perm.allowed) return `Permission denied: ${perm.reason}`;

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !from) {
      return "SMS not configured (missing Twilio credentials).";
    }

    try {
      const to = (input.to as string) || "";
      if (!to) return "No phone number provided and user phone not found.";

      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
        },
        body: new URLSearchParams({ From: from, To: to, Body: input.body as string }),
      });

      if (!response.ok) {
        const err = await response.text();
        return `SMS failed: ${err}`;
      }

      return JSON.stringify({ success: true, to, body: (input.body as string).slice(0, 50) });
    } catch (err) {
      return `SMS error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

export const sendEmail: ToolDefinition = {
  name: "send_email",
  description: "Send an email. Requires send_email permission.",
  input_schema: {
    type: "object",
    properties: {
      to: { type: "string", description: "Recipient email" },
      subject: { type: "string", description: "Email subject" },
      body: { type: "string", description: "Email body (plain text)" },
    },
    required: ["to", "subject", "body"],
  },
  tier: "pack",
  timeoutMs: 10_000,
  async execute(input: Record<string, unknown>, tenantId: string): Promise<string> {
    const perm = await checkPermission(tenantId, "send_email");
    if (!perm.allowed) return `Permission denied: ${perm.reason}`;

    // TODO: Implement email sending (SendGrid, Resend, etc.)
    return JSON.stringify({
      success: false,
      message: "Email sending not yet configured. Will be available after integration setup.",
    });
  },
};

export const COMMUNICATION_TOOLS: ToolDefinition[] = [sendSms, sendEmail];
