// Vite auto-discovers every *.js file in this folder (except this index).
// To add a custom theme, copy any theme file, give it a new name, and set a
// unique `id`, `label`, and `order`. The app will pick it up automatically.

const modules = import.meta.glob(["./*.js", "!./index.js"], { eager: true });

const themes = Object.values(modules)
  .map(m => m.default)
  .sort((a, b) => a.order - b.order);

// { auto: { label, defaults }, dark: { label, defaults }, … }
export const THEME_PRESETS = Object.fromEntries(
  themes.map(t => [t.id, { label: t.label, defaults: t.colors ?? null }])
);

// Default color map for DEFAULT_SETTINGS — every non-auto theme included
export const DEFAULT_THEME_COLORS = Object.fromEntries(
  themes.filter(t => t.colors).map(t => [t.id, { ...t.colors }])
);
