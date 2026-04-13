# Steam Manager

A desktop app for managing multiple Steam accounts. Track cooldowns, ban status, CS2 playtime, and Premier rating across all your accounts from a single interface. Switch accounts with one click.

Built with Electron, React, and Express.

---

## Features

- **Account cards** — avatar, profile name, login name, Steam ID, CS2 hours, Prime/Premier badges
- **Status sections** — accounts automatically sorted into Favorites, Available, On Cooldown, and Banned
- **Cooldown tracking** — set cooldowns with natural input (`20h`, `3d`, `2w`), see time remaining, tooltip shows exact expiry
- **One-click account switching** — writes directly to Steam's `loginusers.vdf` and relaunches Steam into the target account
- **Steam data refresh** — fetches live ban status, avatar, and CS2 playtime via the Steam Web API
- **Auto-refresh** — optionally refresh all accounts in the background every 5, 15, or 30 minutes
- **Favorites** — star any account to pin it above all other sections
- **Search** — filter by name, alias, or Steam ID
- **Filter chips** — filter by Available / Cooldown / Banned / Prime / Premier / Drop eligibility
- **Sort** — by date added, name, playtime, Premier rating, Steam ID, or a custom drag-and-drop order
- **Keyboard navigation** — vim-style shortcuts for navigating and switching accounts without touching the mouse
- **Collapsible sections** — collapse any status section; collapsed state persists across restarts
- **Collapsible sidebar** — shrinks to icon-only mode for more card space
- **Themes** — Catppuccin Mocha, Catppuccin Latte, OLED Dark, or System Auto (follows OS dark/light mode)
- **Custom colors** — tweak any individual color per theme
- **Weekly drop tracking** — track which Prime accounts have collected their CS2 care package this week

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

### Build (Windows installer)

```bash
npm run electron:build
```

Output goes to `dist-electron/`. Produces an NSIS installer.

---

## Steam API Key

Open **Settings → Steam API key** and paste your key. Without it, ban status and CS2 playtime won't be fetched.

Get one free at [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey).

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `/` | Focus search bar |
| `Escape` | Clear search / deselect card |
| `h` / `←` | Move focus left |
| `l` / `→` | Move focus right |
| `j` / `↓` | Move focus down |
| `k` / `↑` | Move focus up |
| `Enter` | Switch to the focused account |

Navigation is spatially aware — in grid layout, keys move to the nearest card in that direction across rows and columns. In list layout, up/down navigate linearly and left/right do nothing.

---

## Right-Click Menu

Right-clicking any card opens a context menu with:

- Refresh Steam data
- Set / clear cooldown
- Switch to account
- View cooldown history
- Toggle weekly drop collected
- View drop history
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

## Data Storage

All data is stored locally in `%APPDATA%\steam-manager\` (Windows). Nothing is sent anywhere except the Steam Web API for profile lookups.

| File | Contents |
|------|----------|
| `accounts.json` | Account list |
| `config.json` | API key and Steam path |
| `.key` | Encryption key for stored passwords |

---

## Project Structure

```
steam-manager/
├── electron/        # Electron main process
│   ├── main.js
│   └── preload.js
├── server/          # Express REST API
│   └── index.js
├── client/          # React + Vite frontend
│   └── src/
│       ├── App.jsx
│       ├── App.module.css
│       └── cooldown.js
└── package.json
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Express + Vite dev servers |
| `npm run electron:dev` | Run in Electron (dev mode) |
| `npm run electron:build` | Build Windows installer |
| `npm test` | Run server tests |
