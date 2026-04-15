const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const fs   = require("fs");

// Enable native Wayland rendering when running on a Wayland compositor.
// Falls back to XWayland automatically when not on Wayland.
if (process.platform === "linux") {
  app.commandLine.appendSwitch("enable-features", "UseOzonePlatform,WaylandWindowDecorations");
  app.commandLine.appendSwitch("ozone-platform-hint", "auto");
}

const isDev = !app.isPackaged;
const PORT  = 3001;

// ── Data paths ────────────────────────────────────────────────────────────────
// Writable user data lives in %APPDATA%\steam-manager (never inside the package).
// The server reads DATA_DIR and RESOURCES_DIR from env — must be set before require.

const dataDir = app.getPath("userData");
fs.mkdirSync(dataDir, { recursive: true });

// One-time migration: copy any existing data files from server/ into userData
// so the user doesn't lose their accounts on first Electron launch.
const serverDir = isDev
  ? path.join(__dirname, "..", "server")
  : path.join(process.resourcesPath, "app", "server");

for (const file of ["accounts.json", "config.json", ".key"]) {
  const src = path.join(serverDir, file);
  const dst = path.join(dataDir, file);
  if (fs.existsSync(src) && !fs.existsSync(dst)) {
    try { fs.copyFileSync(src, dst); } catch { /* ignore */ }
  }
}

process.env.DATA_DIR = dataDir;

// ── Start Express server in-process ──────────────────────────────────────────
// Requiring the server module here runs all its setup code but does NOT start
// listening (the listen call is guarded by `require.main === module`).
// We call startServer() ourselves so we control when the window opens.

const { startServer } = require("../server/index.js");

// ── Electron window ───────────────────────────────────────────────────────────

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 680,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
    title: "Steam Manager",
  });

  // Dev: load Vite dev server so HMR works.
  // Prod: Express serves the built React app on the same port as the API.
  mainWindow.loadURL(isDev ? "http://localhost:5173" : `http://localhost:${PORT}`);

  // Steam profile links open in the system browser, not inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(async () => {
  // In dev, npm run dev already starts the backend on PORT — don't start a second one.
  if (!isDev) {
    await startServer(PORT);
  }
  createWindow();
});

app.on("window-all-closed", () => app.quit());
