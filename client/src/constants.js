export const API = "/api/accounts";

export const FILTER_COOKIE = "sm_filters";
export const SETTINGS_KEY  = "sm_settings";

export { THEME_PRESETS } from "./themes/index.js";
import { DEFAULT_THEME_COLORS } from "./themes/index.js";
export const COLOR_LABELS = [
  ["bg", "Background"], ["surface", "Sidebar"],
  ["card", "Card"], ["card-h", "Card hover"],
  ["border", "Border"], ["accent", "Accent"],
  ["accent-d", "Accent 2"], ["text", "Text"],
  ["dim", "Dim text"], ["muted", "Muted"],
  ["green", "Green"], ["yellow", "Yellow"],
  ["red", "Red"], ["orange", "Orange"],
  ["cyan", "Cyan"], ["pink", "Pink"],
];

export const AUTO_REFRESH_OPTIONS = [
  { value: 0,    label: "Off"     },
  { value: 5,    label: "5 min"   },
  { value: 15,   label: "15 min"  },
  { value: 30,   label: "30 min"  },
];

export const DEFAULT_SETTINGS = {
  showPrimeBadge: true,
  showPremierBadge: true,
  dropEligibleOnly: true,
  showSteamId: true,
  showLoginName: true,
  showPlaytime: true,
  sidebarCollapsed: false,
  cardLayout: "grid",
  sortField: "createdAt",
  sortDir: "desc",
  customOrder: [],
  sectionOrder: ["Favorites", "Available", "On Cooldown", "Banned"],
  themeMode: "dark",
  colors: { ...DEFAULT_THEME_COLORS },
  autoRefreshInterval: 0,
};

export const SORT_OPTIONS = [
  { value: "createdAt",     label: "Date Added"     },
  { value: "name",          label: "Name"            },
  { value: "cs2Hours",      label: "Playtime"        },
  { value: "premierRating", label: "Premier Rating"  },
  { value: "steamId64",     label: "Steam ID"        },
  { value: "custom",        label: "Custom Order"    },
];
