const express = require("express");
const fs      = require("fs");
const path    = require("path");

const API_KEY  = process.env.API_KEY;
const PORT     = process.env.PORT || 4000;
const DATA_DIR = process.env.DATA_DIR || "/data";
const DATA_FILE = path.join(DATA_DIR, "sync.json");

if (!API_KEY) {
  console.error("API_KEY environment variable is required");
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: "20mb" }));

function requireApiKey(req, res, next) {
  if (req.headers["x-api-key"] !== API_KEY) return res.status(401).json({ error: "Unauthorized" });
  next();
}

// GET /sync — return the stored encrypted blob
app.get("/sync", requireApiKey, (req, res) => {
  if (!fs.existsSync(DATA_FILE)) return res.json({ exists: false });
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    res.json({ exists: true, ...data });
  } catch {
    res.status(500).json({ error: "Corrupted sync data" });
  }
});

// POST /sync — store an encrypted blob (overwrites)
app.post("/sync", requireApiKey, (req, res) => {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const payload = { ...req.body, syncedAt: new Date().toISOString() };
    fs.writeFileSync(DATA_FILE, JSON.stringify(payload), "utf8");
    res.json({ ok: true, syncedAt: payload.syncedAt });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Sync server running on port ${PORT}`));
