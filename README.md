# Steam Manager

A desktop app for managing multiple Steam accounts. Track cooldowns, ban status, CS2 playtime, Premier rating, and weekly drop eligibility across all your accounts from a single interface. Switch accounts with one click.

Built with Electron, React, and Express.

---

## Features

- **Account cards** — avatar, profile name, login name, Steam ID, CS2 hours, Prime/Premier badges
- **Status sections** — accounts automatically sorted into Favorites, Available, On Cooldown, and Banned
- **Cooldown tracking** — set cooldowns with natural input (`20h`, `3d`, `2w`), see time remaining, tooltip shows exact expiry; full cooldown history per account
- **One-click account switching** — writes directly to Steam's `loginusers.vdf` and relaunches Steam into the target account
- **Steam data refresh** — fetches live ban status, avatar, and CS2 playtime via the Steam Web API
- **Auto-refresh** — optionally refresh all accounts in the background every 5, 15, or 30 minutes
- **Weekly drop tracking** — track which Prime accounts have collected their CS2 care package this week; view full drop history per account
- **Leetify stats** — view Leetify ratings, skill breakdowns, side stats, and recent matches directly in the app (requires a Leetify API key)
- **Ban Watcher** — monitor any Steam profile for new VAC/game bans; auto-checks every 4 hours
- **Notifications** — in-app notification bell alerts you when a watched account gets banned or one of your own accounts receives a ban
- **Favorites** — star any account to pin it above all other sections
- **Search** — filter by name, alias, or Steam ID
- **Filter chips** — filter by Available / Cooldown / Banned / Prime / Premier / Drop eligibility
- **Sort** — by date added, name, playtime, Premier rating, Steam ID, or a custom drag-and-drop order
- **Keyboard navigation** — vim-style shortcuts for navigating and switching accounts without touching the mouse
- **Collapsible sections** — collapse any status section; collapsed state persists across restarts
- **Collapsible sidebar** — shrinks to icon-only mode for more card space
- **Themes** — Catppuccin Mocha, Catppuccin Latte, OLED Dark, Material Dark, Material Light, or System Auto; fully customisable per-color
- **Custom themes** — add a new theme by dropping a single file into `client/src/themes/`
- **Export / Import** — back up and restore your account list as JSON
- **Automation API** — external programs can mark drops, query drop eligibility, and trigger account switches over a local HTTP API

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

Output goes to `dist-electron/`.

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
- **Leetify API key** — optional. Enables Leetify stats on account cards. Get yours from your Leetify account settings.
- **Auto-refresh interval** — automatically refresh all Steam data in the background.
- **Card layout** — grid or list.
- **Colors** — customise every color per theme.

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
- Set / clear cooldown
- Switch to account
- View cooldown history
- Toggle weekly drop collected
- View drop history
- View Leetify stats
- Edit account
- Add to / remove from favorites

---

## Cooldown Format

| Input | Means |
|-------|-------|
| `45m` | 45 minutes |
| `6h` | 6 hours |
| `10d` | 10 days |
| `2w` | 2 weeks |

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
  order: 10,
  colors: {
    "bg": "#0d1117", "surface": "#161b22", "card": "#21262d", "card-h": "#30363d",
    "border": "#30363d", "accent": "#58a6ff", "accent-d": "#79c0ff",
    "green": "#56d364",  "yellow": "#e3b341", "red": "#f85149",
    "text": "#c9d1d9",   "dim": "#8b949e",    "muted": "#484f58",
  },
};
```

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

An external drop-detection tool can call these endpoints to advance through accounts automatically:

```bash
# 1. Drop detected on current account — mark it done
curl -X POST http://localhost:3001/api/accounts/<id>/drop

# 2. Switch to the next eligible account
curl -X POST http://localhost:3001/api/automation/next-drop/switch
# → { "found": true, "remaining": 3, "account": { "name": "...", ... } }

# When remaining hits 0, all accounts are done for the week
```

The `remaining` field in the response tells you how many eligible accounts are left after the switch.

---

## Data Storage

All data is stored locally. Nothing is sent anywhere except the Steam Web API and Leetify API for profile lookups.

| Platform | Location |
|----------|----------|
| Windows | `%APPDATA%\steam-manager\` |
| Linux | `~/.config/steam-manager/` |

| File | Contents |
|------|----------|
| `accounts.json` | Account list |
| `config.json` | API keys |
| `.key` | Encryption key for stored passwords |

---

## Project Structure

```
steam-manager/
├── electron/           # Electron main process
│   ├── main.js
│   └── preload.js
├── server/             # Express REST API + Steam integration
│   ├── index.js        # Routes and automation API
│   ├── steam.js        # Steam path detection, kill, VDF parsing
│   ├── crypto.js       # Password encryption
│   ├── db.js           # Account persistence
│   ├── watchlist.js    # Ban watcher
│   └── notifications.js
├── client/             # React + Vite frontend
│   └── src/
│       ├── App.jsx
│       ├── App.module.css
│       ├── themes/     # One file per theme — add new themes here
│       └── components/
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
