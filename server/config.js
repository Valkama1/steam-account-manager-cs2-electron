const fs   = require("fs");
const path = require("path");

const DATA_DIR    = process.env.DATA_DIR || __dirname;
const CONFIG_PATH = path.join(DATA_DIR, "config.json");

function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) fs.writeFileSync(CONFIG_PATH, JSON.stringify({ steamApiKey: "" }, null, 2));
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

function writeConfig(data) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
}

module.exports = { readConfig, writeConfig };
