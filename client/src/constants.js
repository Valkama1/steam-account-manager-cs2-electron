export const API = "/api/accounts";

export const FILTER_COOKIE = "sm_filters";
export const SETTINGS_KEY  = "sm_settings";

export const CATPPUCCIN_MOCHA = {
  "bg": "#1e1e2e", "surface": "#181825", "card": "#232336", "card-h": "#2a2b40",
  "border": "#313244", "accent": "#89b4fa", "accent-d": "#74c7ec",
  "green": "#a6e3a1", "yellow": "#f9e2af", "red": "#f38ba8",
  "text": "#cdd6f4", "dim": "#6c7086", "muted": "#585b70",
};
export const CATPPUCCIN_LATTE = {
  "bg": "#e6e9ef", "surface": "#dce0e8", "card": "#eff1f5", "card-h": "#ccd0da",
  "border": "#bcc0cc", "accent": "#1e66f5", "accent-d": "#209fb5",
  "green": "#40a02b", "yellow": "#df8e1d", "red": "#d20f39",
  "text": "#4c4f69", "dim": "#6c6f85", "muted": "#acb0be",
};
export const OLED_DARK = {
  "bg": "#000000", "surface": "#000000", "card": "#141414", "card-h": "#1e1e1e",
  "border": "#2e2e2e", "accent": "#00d4ff", "accent-d": "#bf5fff",
  "green": "#00ff87", "yellow": "#ffe600", "red": "#ff2d55",
  "text": "#ffffff", "dim": "#888888", "muted": "#4a4a4a",
};
export const MATERIAL_DARK = {
  "bg": "#141218", "surface": "#1c1b1f", "card": "#211f26", "card-h": "#2b2930",
  "border": "#49454f", "accent": "#d0bcff", "accent-d": "#ccc2dc",
  "green": "#6dd58c", "yellow": "#e6c353", "red": "#f2b8b5",
  "text": "#e6e0e9", "dim": "#cac4d0", "muted": "#938f99",
};
export const MATERIAL_LIGHT = {
  "bg": "#fef7ff", "surface": "#f3edf7", "card": "#ece6f0", "card-h": "#e6e0e9",
  "border": "#cac4d0", "accent": "#6750a4", "accent-d": "#7965af",
  "green": "#386a20", "yellow": "#6e5c00", "red": "#b3261e",
  "text": "#1d1b20", "dim": "#49454f", "muted": "#79747e",
};

export const THEME_PRESETS = {
  auto:           { label: "System Auto",      defaults: null             },
  dark:           { label: "Catppuccin Mocha", defaults: CATPPUCCIN_MOCHA },
  light:          { label: "Catppuccin Latte", defaults: CATPPUCCIN_LATTE },
  oled:           { label: "OLED Dark",        defaults: OLED_DARK        },
  "material-dark":  { label: "Material Dark",  defaults: MATERIAL_DARK    },
  "material-light": { label: "Material Light", defaults: MATERIAL_LIGHT   },
};
export const COLOR_LABELS = [
  ["bg", "Background"], ["surface", "Sidebar"],
  ["card", "Card"], ["card-h", "Card hover"],
  ["border", "Border"], ["accent", "Accent"],
  ["accent-d", "Accent dark"], ["text", "Text"],
  ["dim", "Dim text"], ["muted", "Muted"],
  ["green", "Green"], ["yellow", "Yellow"],
  ["red", "Red"],
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
  colors: { dark: { ...CATPPUCCIN_MOCHA }, light: { ...CATPPUCCIN_LATTE }, oled: { ...OLED_DARK }, "material-dark": { ...MATERIAL_DARK }, "material-light": { ...MATERIAL_LIGHT } },
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
