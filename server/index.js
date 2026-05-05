import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import marketRoutes from "./routes/market.js";
import portfolioRoutes from "./routes/portfolio.js";
import importRoutes from "./routes/import.js";
import taxRoutes from "./routes/tax.js";
import alertRoutes from "./routes/alerts.js";
import notesRoutes from "./routes/notes.js";
import { buildStale } from "./buildCheck.js";
import { startAlertScheduler } from "./alerts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT ?? 3007;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Build staleness check
app.get("/api/build-status", (_req, res) => {
  res.json({ stale: buildStale });
});

// API routes
app.use("/api/market", marketRoutes);
app.use("/api/portfolio", portfolioRoutes);
app.use("/api/import", importRoutes);
app.use("/api/tax", taxRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/notes", notesRoutes);

// Serve static frontend in production
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../dist")));
  app.get("/{*path}", (_req, res) => {
    res.sendFile(path.join(__dirname, "../dist/index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Crypto tracker running on :${PORT}`);
  startAlertScheduler();
});
