const { app, BrowserWindow, shell, ipcMain, dialog, screen } = require("electron");
const { autoUpdater } = require("electron-updater");
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

// ── Window state persistence ──────────────────────────────────────────────────

const windowStateFile = path.join(dataDir, "window-state.json");

function loadWindowState() {
  try {
    const saved = JSON.parse(fs.readFileSync(windowStateFile, "utf8"));
    // Verify the saved position is still on an existing display; if not, fall back to defaults.
    const visible = screen.getAllDisplays().some(d => {
      const b = d.bounds;
      return saved.x < b.x + b.width  && saved.x + saved.width  > b.x
          && saved.y < b.y + b.height && saved.y + saved.height > b.y;
    });
    if (visible) return saved;
  } catch { /* first launch or corrupt file — use defaults */ }
  return { width: 1400, height: 860, isMaximized: false };
}

function saveWindowState(win) {
  const isMaximized = win.isMaximized();
  const bounds = isMaximized ? win.getNormalBounds() : win.getBounds();
  fs.writeFileSync(windowStateFile, JSON.stringify({ ...bounds, isMaximized }), "utf8");
}

// ── Electron window ───────────────────────────────────────────────────────────

let mainWindow;

function createWindow() {
  const state = loadWindowState();

  mainWindow = new BrowserWindow({
    width:     state.width,
    height:    state.height,
    x:         state.x,
    y:         state.y,
    minWidth:  680,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
    title: "Steam Manager",
  });

  if (state.isMaximized) mainWindow.maximize();

  // Dev: load Vite dev server so HMR works.
  // Prod: Express serves the built React app on the same port as the API.
  mainWindow.loadURL(isDev ? "http://localhost:5173" : `http://localhost:${PORT}`);

  // Steam profile links open in the system browser, not inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("close", () => saveWindowState(mainWindow));
}

// ── Auto-updater ──────────────────────────────────────────────────────────────

autoUpdater.autoDownload        = true;
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on("update-available",  (info) => mainWindow?.webContents.send("update:available",  info));
autoUpdater.on("update-downloaded", (info) => mainWindow?.webContents.send("update:downloaded", info));
autoUpdater.on("error", (err) => console.error("[updater]", err.message));

ipcMain.on("update:install", () => autoUpdater.quitAndInstall());

app.whenReady().then(async () => {
  // In dev, npm run dev already starts the backend on PORT — don't start a second one.
  if (!isDev) {
    await startServer(PORT);
  }
  createWindow();

  if (!isDev) {
    // Delay first check so the window is ready before any dialogs could appear.
    setTimeout(() => autoUpdater.checkForUpdates(), 5000);
    // Re-check every 6 hours for long-running sessions.
    setInterval(() => autoUpdater.checkForUpdates(), 6 * 60 * 60 * 1000);
  }
});

app.on("window-all-closed", () => app.quit());

ipcMain.handle("shell:get-file-icon", async (_, filePath) => {
  try {
    const icon = await app.getFileIcon(filePath, { size: "normal" });
    return icon.toDataURL();
  } catch { return null; }
});

ipcMain.handle("dialog:open-file", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [
      { name: "Executables", extensions: ["exe", "bat", "cmd", "sh", "app"] },
      { name: "All Files",   extensions: ["*"] },
    ],
  });
  return result.canceled ? null : result.filePaths[0];
});
