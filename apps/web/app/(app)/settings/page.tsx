"use client";

import { useEffect, useState, useCallback } from "react";

interface TenantSettings {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  timezone: string;
  settings: Record<string, unknown>;
  autonomy_grants: Record<string, boolean>;
  channel_ids: Record<string, string>;
  onboarding_complete: boolean;
}

const AUTONOMY_PERMISSIONS = [
  { key: "send_sms", label: "Send SMS", description: "Send text messages on your behalf" },
  { key: "send_email", label: "Send Email", description: "Send emails on your behalf" },
  { key: "outbound_call", label: "Make Calls", description: "Make phone calls on your behalf" },
  { key: "build_app", label: "Build Apps", description: "Create and deploy applications" },
  { key: "connect_integration", label: "Connect Services", description: "Link external services (Google, Notion, etc.)" },
  { key: "spend_money", label: "Spend Money", description: "Make purchases or payments" },
];

const TIMEZONES = [
  "Europe/Warsaw", "Europe/London", "Europe/Berlin", "Europe/Paris",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "Asia/Tokyo", "Asia/Shanghai", "Australia/Sydney", "UTC",
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchSettings = useCallback(async () => {
    const res = await fetch("/api/settings");
    if (res.ok) setSettings(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  async function save(updates: Partial<TenantSettings>) {
    setSaving(true);
    setSaved(false);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const data = await res.json();
      setSettings((prev) => prev ? { ...prev, ...data } : prev);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }

  function toggleGrant(key: string) {
    if (!settings) return;
    const newGrants = {
      ...settings.autonomy_grants,
      [key]: !settings.autonomy_grants[key],
    };
    setSettings({ ...settings, autonomy_grants: newGrants });
    save({ autonomy_grants: newGrants } as Partial<TenantSettings>);
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <span className="text-sm text-muted-foreground">Loading settings...</span>
      </div>
    );
  }

  if (!settings) return null;

  return (
    <div className="h-full overflow-y-auto">
      <header className="sticky top-0 z-10 flex items-center justify-between px-6 py-3 border-b border-border bg-background/80 backdrop-blur-sm">
        <h1 className="text-lg font-semibold">Settings</h1>
        {saved && (
          <span className="text-xs text-green-600 bg-green-500/10 px-2 py-1 rounded">
            Saved
          </span>
        )}
      </header>

      <div className="max-w-2xl mx-auto p-6 space-y-8">
        {/* Profile */}
        <Section title="Profile">
          <Field label="Name">
            <input
              type="text"
              defaultValue={settings.name || ""}
              onBlur={(e) => save({ name: e.target.value || null } as Partial<TenantSettings>)}
              className="input-field"
              placeholder="Your name"
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              defaultValue={settings.email || ""}
              className="input-field"
              disabled
              title="Managed by auth provider"
            />
          </Field>
          <Field label="Phone">
            <input
              type="tel"
              defaultValue={settings.phone || ""}
              onBlur={(e) => save({ phone: e.target.value || null } as Partial<TenantSettings>)}
              className="input-field"
              placeholder="+48..."
            />
          </Field>
          <Field label="Timezone">
            <select
              defaultValue={settings.timezone}
              onChange={(e) => save({ timezone: e.target.value } as Partial<TenantSettings>)}
              className="input-field"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </Field>
        </Section>

        {/* Autonomy Permissions */}
        <Section title="Autonomy Permissions" description="Control what ExoSkull can do without asking you first.">
          <div className="space-y-3">
            {AUTONOMY_PERMISSIONS.map((perm) => (
              <div key={perm.key} className="flex items-center justify-between py-1">
                <div>
                  <p className="text-sm font-medium">{perm.label}</p>
                  <p className="text-xs text-muted-foreground">{perm.description}</p>
                </div>
                <button
                  onClick={() => toggleGrant(perm.key)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    settings.autonomy_grants[perm.key] ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      settings.autonomy_grants[perm.key] ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </Section>

        {/* Channels */}
        <Section title="Connected Channels">
          <div className="space-y-3">
            <ChannelStatus
              name="Telegram"
              connected={!!settings.channel_ids.telegram}
              detail={settings.channel_ids.telegram ? `ID: ${settings.channel_ids.telegram}` : "Not connected"}
              instructions="Message your ExoSkull bot on Telegram to connect."
            />
            <ChannelStatus
              name="Web Chat"
              connected={true}
              detail="Active (this interface)"
            />
            <ChannelStatus
              name="SMS"
              connected={!!settings.phone}
              detail={settings.phone || "Add phone number above"}
            />
          </div>
        </Section>

        {/* AI Settings */}
        <Section title="AI Preferences">
          <Field label="Language">
            <select
              defaultValue={(settings.settings.language as string) || "pl"}
              onChange={(e) => save({ settings: { ...settings.settings, language: e.target.value } } as Partial<TenantSettings>)}
              className="input-field"
            >
              <option value="pl">Polski</option>
              <option value="en">English</option>
              <option value="auto">Auto-detect</option>
            </select>
          </Field>
          <Field label="Personality">
            <select
              defaultValue={(settings.settings.personality as string) || "default"}
              onChange={(e) => save({ settings: { ...settings.settings, personality: e.target.value } } as Partial<TenantSettings>)}
              className="input-field"
            >
              <option value="default">Balanced</option>
              <option value="direct">Direct & concise</option>
              <option value="warm">Warm & supportive</option>
              <option value="coach">Strict coach</option>
            </select>
          </Field>
        </Section>

        {/* Danger Zone */}
        <Section title="Danger Zone">
          <p className="text-xs text-muted-foreground mb-3">
            These actions are irreversible. Contact support if you need help.
          </p>
          <button
            className="text-xs text-destructive border border-destructive/30 px-3 py-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
            onClick={() => alert("Export coming soon. Contact support for now.")}
          >
            Export All Data
          </button>
        </Section>
      </div>

      <style jsx>{`
        .input-field {
          width: 100%;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          background: var(--background);
          border: 1px solid var(--border);
          border-radius: 0.5rem;
        }
        .input-field:focus {
          outline: none;
          box-shadow: 0 0 0 1px var(--primary);
        }
        .input-field:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

// ── Reusable Components ─────────────────────────────────────────────────

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold mb-1">{title}</h2>
      {description && <p className="text-xs text-muted-foreground mb-3">{description}</p>}
      <div className="bg-card border border-border rounded-xl p-4">
        {children}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 gap-4">
      <label className="text-sm text-muted-foreground shrink-0 w-24">{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function ChannelStatus({ name, connected, detail, instructions }: {
  name: string;
  connected: boolean;
  detail: string;
  instructions?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <div>
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
        {!connected && instructions && (
          <p className="text-xs text-muted-foreground mt-0.5 italic">{instructions}</p>
        )}
      </div>
      <span
        className={`text-[10px] px-2 py-0.5 rounded-full ${
          connected ? "bg-green-500/10 text-green-600" : "bg-muted text-muted-foreground"
        }`}
      >
        {connected ? "Connected" : "Not connected"}
      </span>
    </div>
  );
}
