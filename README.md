# Steam Manager

A desktop app for managing multiple Steam accounts. Track cooldowns, ban status, CS2 playtime, Premier rating, Leetify stats, and weekly drop eligibility across all your accounts from a single interface. Switch accounts with one click.

Built with Electron, React, and Express. Mostly built using [Claude Code](https://claude.ai/code).

---

## Features

### Account Management
- **Account cards** — avatar, profile name, login name, alias, Steam ID, CS2 hours, notes, Prime/Premier badges
- **One-click account switching** — writes directly to Steam's `loginusers.vdf` and registry, then relaunches Steam into the target account
- **Status sections** — accounts automatically sorted into Favorites, Available, On Cooldown, and Banned; sections are drag-and-drop reorderable
- **Favorites** — star any account to pin it to the top
- **Search** — filter by name, alias, or Steam ID
- **Filter chips** — filter by Available / Cooldown / Banned / Prime / Premier / Drop eligibility
- **Sort** — by date added, name, playtime, Premier rating, Steam ID, or a fully custom drag-and-drop order

### Steam Data
- **Live refresh** — fetches ban status, avatar, profile name, and CS2 playtime via the Steam Web API
- **Auto-refresh** — optionally refresh all accounts in the background every 5, 15, or 30 minutes
- **Ban Watcher** — monitor any Steam profile for new VAC/game bans; auto-checks every 4 hours with desktop notifications

### CS2 Specific
- **Cooldown tracking** — set cooldowns with natural input (`20h`, `3d`, `2w`), see time remaining, full cooldown history with type tagging (abandon, griefing, friendly fire, etc.)
- **Weekly drop tracking** — track which Prime accounts have collected their CS2 care package this week; view full drop history per account with a countdown to the weekly reset
- **Premier rating** — set manually or auto-fetched from Leetify; displayed on the card in CS2's tier-colored number plate style

### Leetify Integration
- **Leetify stats strip** — accounts with a detected Leetify profile show their Premier rank, win rate, and Leetify rating directly on the card, styled in the rank's tier color
- **Per-account refresh** — right-click any account to force a fresh Leetify lookup
- **Bulk refresh** — Refresh All includes Leetify for all accounts simultaneously (2 concurrent workers)
- **Leetify profile link** — click the Leetify icon on any card to open their profile in the browser

### Vault Security
- **Master password** — protect your stored account passwords with PBKDF2-SHA256 (600k iterations) key derivation and AES-256-GCM encryption
- **Recovery key** — 32-byte random hex recovery key generated at setup in case you forget your master password
- **TOTP 2FA** — optionally require a 6-digit authenticator code (Google Authenticator, Authy, etc.) on every vault unlock
- **Secure export / import** — export your full account list including encrypted passwords, wrapped under an export passphrase; import re-encrypts passwords under the target machine's vault key
- **Legacy mode** — existing installs without a master password continue to work transparently

### Notifications
- **In-app notification bell** — alerts when a watched account is banned or one of your own accounts receives a VAC/game ban
- **Desktop notifications** — native OS notifications for ban events (when permission granted)

### UI & Customisation
- **Themes** — 11 built-in themes: Catppuccin Mocha, Catppuccin Latte, OLED Dark, Material Dark, Material Light, Dracula, Nord, Tokyo Night, Gruvbox Dark, Rosé Pine, One Dark Pro, plus System Auto
- **Full color editor** — every color variable is editable per theme in Settings
- **Custom themes** — add a new theme by dropping a single JS file into `client/src/themes/`
- **Collapsible sidebar** — shrinks to icon-only mode for more card space
- **Grid / list layout** — switch between card grid and compact single-column list
- **Keyboard navigation** — vim-style (`hjkl`) and arrow-key navigation, spatial-aware across grid rows
- **Drag-and-drop** — reorder both individual cards and entire sections by dragging
- **Automation API** — external programs can query accounts, mark drops, and trigger account switches over a local HTTP API

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Steam](https://store.steampowered.com/) installed on the same machine
- A [Steam Web API key](https://steamcommunity.com/dev/apikey) (free — required for ban status and playtime)

### Development

```bash
# Install root dependencies
npm install

# Install client dependencies
cd client && npm install && cd ..

# Start Express backend + Vite frontend
npm run dev
```

Open `http://localhost:5173` in your browser, or run inside Electron:

```bash
npm run electron:dev
```

Enable verbose server logging:

```bash
npm run electron:dev:debug
```

### Build

```bash
# Windows installer (NSIS)
npm run electron:build

# The same command produces Linux builds when run on Linux:
# AppImage (portable) and .deb (Debian/Ubuntu)
```

Output goes to `dist-electron/`. Target machines do not need Node.js installed.

---

## Platform Support

| Platform | Status |
|----------|--------|
| Windows 10/11 | Full support |
| Linux (X11) | Full support |
| Linux (Wayland) | Full support — native Wayland rendering enabled automatically |
| macOS | Not tested |

On Linux, Steam is located by checking `~/.local/share/Steam`, `~/.steam/steam`, and related paths. Account switching writes to `loginusers.vdf` and `registry.vdf` instead of the Windows registry.

---

## Configuration

Open **Settings** (gear icon in the sidebar) to configure:

- **Steam API key** — required for ban status, playtime, and avatar fetching. Get one free at [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey).
- **Leetify API key** — optional. Enables Leetify stats (Premier rank, win rate, rating) on account cards. Get yours from your Leetify account settings.
- **Auto-refresh interval** — automatically refresh all Steam data in the background.
- **Card layout** — grid or list.
- **Colors** — customise every color variable per theme.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `/` | Focus search bar |
| `Escape` | Clear search / close modal |
| `h` / `←` | Move focus left |
| `l` / `→` | Move focus right |
| `j` / `↓` | Move focus down |
| `k` / `↑` | Move focus up |
| `Enter` | Switch to the focused account |

Navigation is spatially aware — in grid layout, keys move to the nearest card in that direction across rows and columns.

---

## Right-Click Menu

Right-clicking any card opens a context menu with:

- Refresh Steam data
- Refresh Leetify data
- Set / clear cooldown
- View cooldown history
- View drop history
- Edit account
- Switch to account

---

## Cooldown Format

| Input | Means |
|-------|-------|
| `45m` | 45 minutes |
| `6h` | 6 hours |
| `10d` | 10 days |
| `2w` | 2 weeks |

Cooldowns can optionally be tagged with a type (abandon, griefing, friendly fire, suspicious, other) for your records.

---

## Vault Security

Steam Manager optionally encrypts stored passwords with a master password:

1. First launch: choose a master password — a recovery key is shown once, save it somewhere safe
2. The vault key is derived via PBKDF2-SHA256 (600k iterations) and wrapped with AES-256-GCM
3. Optionally enable TOTP 2FA for an additional unlock factor
4. Lock the vault from Settings → Security at any time

**Secure export** wraps the vault key under an export passphrase so passwords stay encrypted in transit. Importing on another machine re-encrypts everything under that machine's vault key.

Existing installs without a master password continue to work in **legacy mode** — no migration required.

---

## Custom Themes

Each theme is a single file in `client/src/themes/`. To add your own:

1. Copy any existing theme file (e.g. `dark.js`) to a new name (e.g. `my-theme.js`)
2. Set a unique `id`, `label`, and `order`
3. Edit the color values
4. Restart the dev server — the new theme appears in Settings automatically

```js
// client/src/themes/my-theme.js
export default {
  id: "my-theme",
  label: "My Theme",
  order: 12,
  colors: {
    "bg": "#0d1117", "surface": "#161b22", "card": "#21262d", "card-h": "#30363d",
    "border": "#30363d", "accent": "#58a6ff", "accent-d": "#79c0ff",
    "green": "#56d364", "yellow": "#e3b341", "red": "#f85149",
    "orange": "#f0883e", "cyan": "#39c5cf", "pink": "#f778ba",
    "text": "#c9d1d9", "dim": "#8b949e", "muted": "#484f58",
  },
};
```

The `orange`, `cyan`, and `pink` slots are used for cooldown indicators, playtime badges, and the favorite star respectively.

---

## Automation API

The Express server exposes a local HTTP API at `http://localhost:3001` that external programs can use without the UI.

A full endpoint listing is always available at:

```
GET http://localhost:3001/api/automation
```

### Key endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/accounts` | List all accounts |
| `POST` | `/api/switch/:id` | Switch Steam to an account |
| `POST` | `/api/accounts/:id/drop` | Mark account as having received a drop this week |
| `DELETE` | `/api/accounts/:id/drop` | Remove the current week's drop mark |
| `GET` | `/api/automation/next-drop` | Find the next Prime account without a drop this week |
| `POST` | `/api/automation/next-drop/switch` | Switch to the next drop-eligible account |
| `GET` | `/api/steam-active` | Check if Steam is running and which account is logged in |

### Example: automated drop rotation

```bash
# 1. Drop detected on current account — mark it done
curl -X POST http://localhost:3001/api/accounts/<id>/drop

# 2. Switch to the next eligible account
curl -X POST http://localhost:3001/api/automation/next-drop/switch
# → { "found": true, "remaining": 3, "account": { "name": "...", ... } }

# When remaining hits 0, all accounts are done for the week
```

---

## Data Storage

All data is stored locally. Nothing is sent anywhere except the Steam Web API and Leetify API for profile lookups.

| Platform | Location |
|----------|----------|
| Windows | `%APPDATA%\steam-manager\` |
| Linux | `~/.config/steam-manager/` |

| File | Contents |
|------|----------|
| `accounts.json` | Account list with all stored data |
| `config.json` | API keys and app config |
| `auth.json` | Vault auth config (master password hash, TOTP secret) |
| `.key` | Legacy encryption key (pre-vault installs) |
| `watchlist.json` | Ban watcher entries |
| `notifications.json` | Notification history |

---

## Project Structure

```
steam-manager/
├── electron/               # Electron main process
│   ├── main.js
│   └── preload.js
├── server/                 # Express REST API
│   ├── index.js            # All routes
│   ├── auth.js             # Vault security (PBKDF2, AES-GCM, TOTP)
│   ├── crypto.js           # Password encryption / decryption
│   ├── steam.js            # Steam path detection, VDF parsing, API calls
│   ├── db.js               # Account persistence
│   ├── config.js           # Config persistence
│   ├── watchlist.js        # Ban watcher
│   ├── notifications.js    # Notification store
│   └── tests/
├── client/                 # React + Vite frontend
│   └── src/
│       ├── App.jsx          # Main app shell
│       ├── App.module.css   # All styles
│       ├── themes/          # One JS file per theme
│       ├── components/      # All UI components
│       └── constants.js
└── package.json
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Express + Vite dev servers |
| `npm run electron:dev` | Run in Electron (dev mode) |
| `npm run electron:dev:debug` | Run in Electron with verbose server logging |
| `npm run electron:build` | Build platform installer |
| `npm test` | Run server tests |
| `npm run test:watch` | Run server tests in watch mode |

---

## Built With

- [Electron](https://www.electronjs.org/) — desktop shell
- [React](https://react.dev/) + [Vite](https://vitejs.dev/) — frontend
- [Express](https://expressjs.com/) — local REST API
- [@dnd-kit](https://dndkit.com/) — drag and drop
- [Claude Code](https://claude.ai/code) — the majority of this app was designed and built through an iterative conversation with Claude Code (Anthropic's AI coding tool), from the initial architecture through to features, styling, and security design
