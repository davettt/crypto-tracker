import { Router } from "express";
import {
  loadAlertSettings,
  saveAlertSettings,
  sendTestEmail,
  checkAlerts,
  loadPriceAlerts,
  savePriceAlerts,
} from "../alerts.js";
import { isValidAsset } from "../assets.js";

const router = Router();

// GET /api/alerts/settings
router.get("/settings", async (_req, res) => {
  try {
    const settings = await loadAlertSettings();
    // Never send the API key to the client — just indicate if it's set
    res.json({
      ...settings,
      resendApiKey: settings.resendApiKey ? "••••••••" : "",
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PUT /api/alerts/settings
router.put("/settings", async (req, res) => {
  try {
    const current = await loadAlertSettings();
    const {
      enabled,
      email,
      resendApiKey,
      fromEmail,
      priceChangeThreshold,
      signalChangeEnabled,
      targetApproachEnabled,
      targetApproachPercent,
    } = req.body;

    if (email != null) {
      if (typeof email !== "string" || email.length > 200) {
        return res.status(400).json({ error: "Invalid email" });
      }
      current.email = email;
    }
    if (resendApiKey != null && resendApiKey !== "••••••••") {
      if (typeof resendApiKey !== "string" || resendApiKey.length > 200) {
        return res.status(400).json({ error: "Invalid API key" });
      }
      current.resendApiKey = resendApiKey;
    }
    if (fromEmail != null) {
      if (typeof fromEmail !== "string" || fromEmail.length > 200) {
        return res.status(400).json({ error: "Invalid from email" });
      }
      current.fromEmail = fromEmail;
    }
    if (enabled != null) current.enabled = Boolean(enabled);
    if (priceChangeThreshold != null) {
      const val = Number(priceChangeThreshold);
      if (!isFinite(val) || val < 0 || val > 100) {
        return res
          .status(400)
          .json({ error: "priceChangeThreshold must be 0-100" });
      }
      current.priceChangeThreshold = val;
    }
    if (signalChangeEnabled != null)
      current.signalChangeEnabled = Boolean(signalChangeEnabled);
    if (targetApproachEnabled != null)
      current.targetApproachEnabled = Boolean(targetApproachEnabled);
    if (targetApproachPercent != null) {
      const val = Number(targetApproachPercent);
      if (!isFinite(val) || val < 1 || val > 50) {
        return res
          .status(400)
          .json({ error: "targetApproachPercent must be 1-50" });
      }
      current.targetApproachPercent = val;
    }

    await saveAlertSettings(current);
    res.json({
      ...current,
      resendApiKey: current.resendApiKey ? "••••••••" : "",
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/alerts/test — send a test email
router.post("/test", async (_req, res) => {
  try {
    const settings = await loadAlertSettings();
    if (!settings.email || !settings.resendApiKey) {
      return res
        .status(400)
        .json({ error: "Email and Resend API key must be configured first" });
    }
    await sendTestEmail(settings);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/alerts/check — manually trigger an alert check
router.post("/check", async (_req, res) => {
  try {
    await checkAlerts();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/alerts/price-alerts
router.get("/price-alerts", async (_req, res) => {
  try {
    res.json(await loadPriceAlerts());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PUT /api/alerts/price-alerts/:asset — set price alerts for an asset
router.put("/price-alerts/:asset", async (req, res) => {
  try {
    const { asset } = req.params;
    if (!isValidAsset(asset)) {
      return res.status(400).json({ error: "Unknown asset" });
    }
    const { alerts: assetAlerts } = req.body;
    if (!Array.isArray(assetAlerts)) {
      return res.status(400).json({ error: "alerts must be an array" });
    }
    for (const a of assetAlerts) {
      if (typeof a.price !== "number" || !isFinite(a.price) || a.price <= 0) {
        return res.status(400).json({ error: "Invalid price" });
      }
      if (a.direction !== "below" && a.direction !== "above") {
        return res
          .status(400)
          .json({ error: "direction must be 'below' or 'above'" });
      }
    }
    const all = await loadPriceAlerts();
    if (assetAlerts.length === 0) {
      delete all[asset];
    } else {
      all[asset] = assetAlerts.map((a) => ({
        price: a.price,
        direction: a.direction,
        note: typeof a.note === "string" ? a.note.slice(0, 200) : "",
        triggered: a.triggered ?? false,
      }));
    }
    await savePriceAlerts(all);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
