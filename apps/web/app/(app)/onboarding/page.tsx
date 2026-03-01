"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Step = "welcome" | "profile" | "goal" | "permissions" | "done";

const STEPS: Step[] = ["welcome", "profile", "goal", "permissions", "done"];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("Europe/Warsaw");
  const [goalTitle, setGoalTitle] = useState("");
  const [goalDescription, setGoalDescription] = useState("");
  const [grants, setGrants] = useState({
    send_sms: false,
    send_email: false,
    build_app: true,
    connect_integration: true,
  });
  const [saving, setSaving] = useState(false);

  const stepIndex = STEPS.indexOf(step);

  function next() {
    const nextIdx = stepIndex + 1;
    if (nextIdx < STEPS.length) setStep(STEPS[nextIdx]);
  }

  async function finishOnboarding() {
    setSaving(true);

    // Save profile + permissions
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim() || null,
        timezone,
        autonomy_grants: grants,
        onboarding_complete: true,
      }),
    });

    // Create first goal if provided
    if (goalTitle.trim()) {
      await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: goalTitle.trim(),
          description: goalDescription.trim() || null,
          depth: 0,
          priority: 8,
        }),
      });
    }

    setSaving(false);
    setStep("done");
  }

  return (
    <div className="h-full flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="flex gap-1 mb-8">
          {STEPS.slice(0, -1).map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full ${
                i <= stepIndex ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        {/* Step: Welcome */}
        {step === "welcome" && (
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-2">Welcome to ExoSkull</h1>
            <p className="text-muted-foreground mb-8">
              Your AI-powered goal executor. Let&apos;s set up your second brain in 2 minutes.
            </p>
            <button onClick={next} className="btn-primary">
              Let&apos;s Go
            </button>
          </div>
        )}

        {/* Step: Profile */}
        {step === "profile" && (
          <div>
            <h2 className="text-lg font-semibold mb-1">About You</h2>
            <p className="text-sm text-muted-foreground mb-6">
              So ExoSkull knows how to address you and when to reach out.
            </p>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-field"
                  placeholder="How should I call you?"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Timezone</label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="input-field"
                >
                  <option value="Europe/Warsaw">Europe/Warsaw (CET)</option>
                  <option value="Europe/London">Europe/London (GMT)</option>
                  <option value="America/New_York">America/New York (EST)</option>
                  <option value="America/Los_Angeles">America/Los Angeles (PST)</option>
                  <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end mt-6">
              <button onClick={next} className="btn-primary">Continue</button>
            </div>
          </div>
        )}

        {/* Step: Goal */}
        {step === "goal" && (
          <div>
            <h2 className="text-lg font-semibold mb-1">Your #1 Goal</h2>
            <p className="text-sm text-muted-foreground mb-6">
              What do you want to achieve? ExoSkull will create a strategy and start working on it.
            </p>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Goal</label>
                <input
                  type="text"
                  value={goalTitle}
                  onChange={(e) => setGoalTitle(e.target.value)}
                  className="input-field"
                  placeholder="e.g., Learn to code, Save $10k, Get fit"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Why? (optional)</label>
                <textarea
                  value={goalDescription}
                  onChange={(e) => setGoalDescription(e.target.value)}
                  className="input-field resize-none"
                  rows={3}
                  placeholder="Why this matters to you, what success looks like..."
                />
              </div>
            </div>
            <div className="flex justify-between mt-6">
              <button onClick={() => setStep("profile")} className="btn-ghost">Back</button>
              <button onClick={next} className="btn-primary">
                {goalTitle.trim() ? "Continue" : "Skip for now"}
              </button>
            </div>
          </div>
        )}

        {/* Step: Permissions */}
        {step === "permissions" && (
          <div>
            <h2 className="text-lg font-semibold mb-1">Autonomy Level</h2>
            <p className="text-sm text-muted-foreground mb-6">
              What can ExoSkull do without asking you? You can always change this later.
            </p>
            <div className="space-y-3">
              {[
                { key: "build_app", label: "Build apps", desc: "Create tools and apps for your goals" },
                { key: "connect_integration", label: "Connect services", desc: "Link Google, Notion, etc." },
                { key: "send_sms", label: "Send SMS", desc: "Text you updates and reminders" },
                { key: "send_email", label: "Send email", desc: "Email on your behalf" },
              ].map((perm) => (
                <label key={perm.key} className="flex items-center justify-between py-2 cursor-pointer">
                  <div>
                    <p className="text-sm font-medium">{perm.label}</p>
                    <p className="text-xs text-muted-foreground">{perm.desc}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={grants[perm.key as keyof typeof grants] || false}
                    onChange={() => setGrants((prev) => ({ ...prev, [perm.key]: !prev[perm.key as keyof typeof prev] }))}
                    className="w-4 h-4 accent-primary"
                  />
                </label>
              ))}
            </div>
            <div className="flex justify-between mt-6">
              <button onClick={() => setStep("goal")} className="btn-ghost">Back</button>
              <button onClick={finishOnboarding} disabled={saving} className="btn-primary">
                {saving ? "Setting up..." : "Complete Setup"}
              </button>
            </div>
          </div>
        )}

        {/* Step: Done */}
        {step === "done" && (
          <div className="text-center">
            <p className="text-3xl mb-3">🧠</p>
            <h2 className="text-lg font-semibold mb-2">You&apos;re all set!</h2>
            <p className="text-sm text-muted-foreground mb-6">
              ExoSkull is ready. Start chatting to work towards your goals.
            </p>
            <button onClick={() => router.push("/")} className="btn-primary">
              Start Chatting
            </button>
          </div>
        )}

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
          .btn-primary {
            font-size: 0.875rem;
            background: var(--primary);
            color: var(--primary-foreground);
            padding: 0.5rem 1.5rem;
            border-radius: 0.5rem;
            transition: opacity 0.15s;
          }
          .btn-primary:hover { opacity: 0.9; }
          .btn-primary:disabled { opacity: 0.5; }
          .btn-ghost {
            font-size: 0.75rem;
            color: var(--muted-foreground);
            padding: 0.5rem 1rem;
          }
          .btn-ghost:hover { color: var(--foreground); }
        `}</style>
      </div>
    </div>
  );
}
