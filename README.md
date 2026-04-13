# Steam Account Manager

A local React + Express app to track Steam accounts and their trade cooldowns.

## Setup

### 1. Install root dependencies (Express + concurrently)
```bash
npm install
```

### 2. Install client dependencies
```bash
cd client && npm install && cd ..
```

### 3. Run both servers
```bash
npm run dev
```

- Frontend: http://localhost:5173
- API:      http://localhost:3001

Data is saved to `server/accounts.json`.

## Cooldown format
| Input | Means        |
|-------|--------------|
| `45m` | 45 minutes   |
| `6h`  | 6 hours      |
| `10d` | 10 days      |
| `2w`  | 2 weeks      |

## Build for production (to host on your server)
```bash
cd client && npm run build
```
Then serve the `client/dist` folder with any static file server, and run `node server/index.js` separately.
