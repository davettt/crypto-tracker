import { useState, useEffect, useRef } from "react";

interface AlertConfig {
  enabled: boolean;
  email: string;
  resendApiKey: string;
  fromEmail: string;
  priceChangeThreshold: number;
  signalChangeEnabled: boolean;
  targetApproachEnabled: boolean;
  targetApproachPercent: number;
}

export default function AlertSettings() {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<AlertConfig | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const didLoad = useRef(false);

  useEffect(() => {
    if (!open || didLoad.current) return;
    didLoad.current = true;
    void fetch("/api/alerts/settings")
      .then((r) => r.json())
      .then((data: AlertConfig) => {
        setConfig(data);
        setApiKey("");
      });
  }, [open]);

  function update(partial: Partial<AlertConfig>) {
    if (!config) return;
    setConfig({ ...config, ...partial });
  }

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    setMessage(null);
    try {
      const body: Record<string, unknown> = { ...config };
      if (apiKey) body.resendApiKey = apiKey;
      else delete body.resendApiKey;

      const res = await fetch("/api/alerts/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error((err as { error: string }).error);
      }
      const updated = (await res.json()) as AlertConfig;
      setConfig(updated);
      setApiKey("");
      setMessage({ type: "success", text: "Settings saved" });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Save failed",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/alerts/test", { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error((err as { error: string }).error);
      }
      setMessage({
        type: "success",
        text: "Test email sent — check your inbox",
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Test failed",
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleCheckNow() {
    setMessage(null);
    try {
      const res = await fetch("/api/alerts/check", { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error((err as { error: string }).error);
      }
      setMessage({
        type: "success",
        text: "Alert check completed — email sent if any triggers fired",
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Check failed",
      });
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-gray-400 hover:text-gray-600"
      >
        Email Alerts{" "}
        {config?.enabled ? (
          <span className="text-green-500">(active)</span>
        ) : (
          "(disabled)"
        )}
      </button>
    );
  }

  if (!config) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-400">
        Loading alert settings...
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        Email Alerts
      </h4>

      {message && (
        <div
          className={`mt-2 rounded-md p-2 text-xs ${
            message.type === "success"
              ? "border border-green-200 bg-green-50 text-green-700"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="mt-3 space-y-3">
        {/* Enable toggle */}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
            className="rounded"
          />
          <span className="text-sm text-gray-700">
            Enable email alerts (checked every 4 hours)
          </span>
        </label>

        {/* Email */}
        <div>
          <label className="block text-xs text-gray-500">
            Alert email address
          </label>
          <input
            type="email"
            value={config.email}
            onChange={(e) => update({ email: e.target.value })}
            placeholder="you@example.com"
            className="mt-1 w-full rounded border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
          />
        </div>

        {/* Resend API key */}
        <div>
          <label className="block text-xs text-gray-500">Resend API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              config.resendApiKey
                ? "Key saved (enter new to replace)"
                : "re_..."
            }
            className="mt-1 w-full rounded border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
          />
          <p className="mt-0.5 text-xs text-gray-400">
            Get one free at resend.com/api-keys
          </p>
        </div>

        {/* From email */}
        <div>
          <label className="block text-xs text-gray-500">
            From email address
          </label>
          <input
            type="email"
            value={config.fromEmail}
            onChange={(e) => update({ fromEmail: e.target.value })}
            className="mt-1 w-full rounded border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
          />
          <p className="mt-0.5 text-xs text-gray-400">
            Use alerts@resend.dev for free tier, or your verified domain
          </p>
        </div>

        <hr className="border-gray-200" />

        {/* Triggers */}
        <div>
          <h5 className="text-xs font-semibold text-gray-500">
            Alert Triggers
          </h5>

          <label className="mt-2 flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.signalChangeEnabled}
              onChange={(e) =>
                update({ signalChangeEnabled: e.target.checked })
              }
              className="rounded"
            />
            <span className="text-sm text-gray-700">
              Signal state changes (e.g. HOLD → STRONG BUY)
            </span>
          </label>

          <div className="mt-2">
            <label className="flex items-center gap-2">
              <span className="text-sm text-gray-700">
                24h price change exceeds
              </span>
              <input
                type="number"
                value={config.priceChangeThreshold}
                onChange={(e) =>
                  update({
                    priceChangeThreshold: parseFloat(e.target.value) || 0,
                  })
                }
                min="0"
                max="100"
                step="1"
                className="w-16 rounded border border-gray-200 px-2 py-1 text-sm outline-none focus:border-blue-400"
              />
              <span className="text-sm text-gray-700">%</span>
            </label>
            <p className="mt-0.5 ml-0 text-xs text-gray-400">
              Set to 0 to disable price change alerts
            </p>
          </div>

          <label className="mt-2 flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.targetApproachEnabled}
              onChange={(e) =>
                update({ targetApproachEnabled: e.target.checked })
              }
              className="rounded"
            />
            <span className="text-sm text-gray-700">
              Price approaching target sell price (within
            </span>
            <input
              type="number"
              value={config.targetApproachPercent}
              onChange={(e) =>
                update({
                  targetApproachPercent: parseFloat(e.target.value) || 5,
                })
              }
              min="1"
              max="50"
              step="1"
              className="w-14 rounded border border-gray-200 px-2 py-1 text-sm outline-none focus:border-blue-400"
              disabled={!config.targetApproachEnabled}
            />
            <span className="text-sm text-gray-700">%)</span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={() => void handleTest()}
            disabled={testing || !config.email || !config.resendApiKey}
            className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {testing ? "Sending..." : "Send Test Email"}
          </button>
          <button
            onClick={() => void handleCheckNow()}
            disabled={!config.enabled}
            className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Check Now
          </button>
          <button
            onClick={() => setOpen(false)}
            className="rounded-lg px-4 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
