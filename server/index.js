import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import marketRoutes from "./routes/market.js";
import portfolioRoutes from "./routes/portfolio.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT ?? 3007;

app.use(cors());
app.use(express.json({ limit: "100kb" }));

// API routes
app.use("/api/market", marketRoutes);
app.use("/api/portfolio", portfolioRoutes);

// Serve static frontend in production
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../dist")));
  app.get("/{*path}", (_req, res) => {
    res.sendFile(path.join(__dirname, "../dist/index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Crypto tracker running on :${PORT}`);
});
