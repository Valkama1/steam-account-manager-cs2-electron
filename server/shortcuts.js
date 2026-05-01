const fs   = require("fs");
const path = require("path");

function getFile() {
  const dir = process.env.DATA_DIR || __dirname;
  return path.join(dir, "shortcuts.json");
}

function readShortcuts() {
  try {
    const f = getFile();
    if (!fs.existsSync(f)) return [];
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch { return []; }
}

function writeShortcuts(data) {
  fs.writeFileSync(getFile(), JSON.stringify(data, null, 2), "utf8");
}

module.exports = { readShortcuts, writeShortcuts };
