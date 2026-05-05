import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { isValidAsset } from "../assets.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NOTES_PATH = path.join(__dirname, "../../local_data/asset_notes.json");

async function loadNotes() {
  try {
    return JSON.parse(await fs.readFile(NOTES_PATH, "utf-8"));
  } catch {
    return {};
  }
}

async function saveNotes(notes) {
  await fs.writeFile(NOTES_PATH, JSON.stringify(notes, null, 2) + "\n");
}

const router = Router();

router.get("/", async (_req, res) => {
  res.json(await loadNotes());
});

router.put("/:asset", async (req, res) => {
  const { asset } = req.params;
  if (!isValidAsset(asset)) {
    return res.status(400).json({ error: "Unknown asset" });
  }
  const { thesis } = req.body;
  if (typeof thesis !== "string") {
    return res.status(400).json({ error: "thesis must be a string" });
  }
  const notes = await loadNotes();
  if (thesis.trim() === "") {
    delete notes[asset];
  } else {
    notes[asset] = thesis.trim();
  }
  await saveNotes(notes);
  res.json({ ok: true });
});

export default router;
