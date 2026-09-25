// The design catalogue: every theme, accent, font and built-in wallpaper Dumbify offers.
//
// Data only, shared by the reading view, the settings page, its live preview and the
// popup, so a theme is defined exactly once. The choices are deliberately curated - a
// short list that all look right - rather than a free-for-all of knobs.

export type Scheme = 'light' | 'dark'

export interface Theme {
  id: string
  name: string
  scheme: Scheme
  /** Page background. */
  bg: string
  /** Sidebar and other recessed chrome. */
  sidebar: string
  /** Raised surfaces: cards, menus, popovers. */
  surface: string
  /** Body text. */
  text: string
  /** Secondary text: metadata, descriptions. */
  text2: string
  /** Tertiary marks: row numbers, separators, placeholders. */
  text3: string
  /** Hairline dividers. */
  border: string
  /** The theme's own accent, used when the reader leaves accent on "Theme". */
  accent: string
  /** Where a community palette came from, for the credits line. */
  credit?: string
}

export const THEMES: Theme[] = [
  // ---- Light ----
  {
    id: 'paper', name: 'Paper', scheme: 'light',
    bg: '#f7f5ee', sidebar: '#efece3', surface: '#fffdf8',
    text: '#2a2926', text2: '#67635a', text3: '#8f8a7e', border: '#e2ded2', accent: '#b0472a',
  },
  {
    id: 'snow', name: 'Snow', scheme: 'light',
    bg: '#ffffff', sidebar: '#f7f7f5', surface: '#ffffff',
    text: '#37352f', text2: '#6f6e69', text3: '#91908b', border: '#e9e9e7', accent: '#2383e2',
  },
  {
    id: 'sepia', name: 'Sepia', scheme: 'light',
    bg: '#f4ecd8', sidebar: '#ebe1c8', surface: '#faf4e4',
    text: '#3b2f20', text2: '#665640', text3: '#8b7b60', border: '#dccfb1', accent: '#9a4f22',
  },
  {
    id: 'sage', name: 'Sage', scheme: 'light',
    bg: '#f2f5f0', sidebar: '#e6ebe3', surface: '#fafcf9',
    text: '#1f2a23', text2: '#515f55', text3: '#77857b', border: '#d7ded3', accent: '#357450',
  },
  {
    id: 'latte', name: 'Latte', scheme: 'light',
    bg: '#eff1f5', sidebar: '#e6e9ef', surface: '#f7f8fa',
    text: '#4c4f69', text2: '#5f6279', text3: '#81849a', border: '#d6dae3', accent: '#8839ef',
    credit: 'Catppuccin',
  },
  {
    id: 'dawn', name: 'Dawn', scheme: 'light',
    bg: '#faf4ed', sidebar: '#f2e9e1', surface: '#fffaf3',
    text: '#575279', text2: '#625e80', text3: '#8b869d', border: '#e6dcd2', accent: '#286983',
    credit: 'Rosé Pine',
  },
  {
    id: 'solarized-light', name: 'Solarized', scheme: 'light',
    bg: '#fdf6e3', sidebar: '#eee8d5', surface: '#fffbef',
    text: '#073642', text2: '#52666d', text3: '#7c8c8e', border: '#e4ddc6', accent: '#1f7bbd',
    credit: 'Solarized',
  },
  {
    id: 'frost', name: 'Frost', scheme: 'light',
    bg: '#eceff4', sidebar: '#e5e9f0', surface: '#f5f7fa',
    text: '#2e3440', text2: '#4c566a', text3: '#727c8f', border: '#d8dee9', accent: '#4c6f9c',
    credit: 'Nord',
  },

  // ---- Dark ----
  {
    id: 'ink', name: 'Ink', scheme: 'dark',
    bg: '#1d1d1d', sidebar: '#181818', surface: '#262626',
    text: '#f3f0e8', text2: '#aaa79f', text3: '#7c7a74', border: '#333330', accent: '#c7a36c',
  },
  {
    id: 'graphite', name: 'Graphite', scheme: 'dark',
    bg: '#191919', sidebar: '#202020', surface: '#252525',
    text: '#e3e2e0', text2: '#9d9c99', text3: '#737270', border: '#2f2f2f', accent: '#4a9ee8',
  },
  {
    id: 'midnight', name: 'Midnight', scheme: 'dark',
    bg: '#0f1522', sidebar: '#0b101a', surface: '#161e2e',
    text: '#e4e9f2', text2: '#939eb4', text3: '#687490', border: '#1f2a3d', accent: '#7aa2f7',
  },
  {
    id: 'black', name: 'Black', scheme: 'dark',
    bg: '#000000', sidebar: '#000000', surface: '#101010',
    text: '#ededed', text2: '#a0a0a0', text3: '#6e6e6e', border: '#1f1f1f', accent: '#a78bfa',
  },
  {
    id: 'forest', name: 'Forest', scheme: 'dark',
    bg: '#121a15', sidebar: '#0e1511', surface: '#18221c',
    text: '#e2ece5', text2: '#96a99d', text3: '#6a7d70', border: '#223029', accent: '#6cc08f',
  },
  {
    id: 'mocha', name: 'Mocha', scheme: 'dark',
    bg: '#1e1e2e', sidebar: '#181825', surface: '#27273a',
    text: '#cdd6f4', text2: '#a6adc8', text3: '#7f849c', border: '#313244', accent: '#cba6f7',
    credit: 'Catppuccin',
  },
  {
    id: 'nord', name: 'Nord', scheme: 'dark',
    bg: '#2e3440', sidebar: '#2a2f3a', surface: '#3b4252',
    text: '#eceff4', text2: '#b0b9c9', text3: '#8993a5', border: '#434c5e', accent: '#88c0d0',
    credit: 'Nord',
  },
  {
    id: 'rose-pine', name: 'Rosé Pine', scheme: 'dark',
    bg: '#191724', sidebar: '#1f1d2e', surface: '#26233a',
    text: '#e0def4', text2: '#908caa', text3: '#6e6a86', border: '#2a273f', accent: '#c4a7e7',
    credit: 'Rosé Pine',
  },
  {
    id: 'dracula', name: 'Dracula', scheme: 'dark',
    bg: '#282a36', sidebar: '#21222c', surface: '#343746',
    text: '#f8f8f2', text2: '#b1b5cf', text3: '#7d86b5', border: '#3a3d4e', accent: '#bd93f9',
    credit: 'Dracula',
  },
  {
    id: 'gruvbox', name: 'Gruvbox', scheme: 'dark',
    bg: '#282828', sidebar: '#1d2021', surface: '#32302f',
    text: '#ebdbb2', text2: '#aa9b86', text3: '#847769', border: '#3c3836', accent: '#fabd2f',
    credit: 'Gruvbox',
  },
  {
    id: 'solarized-dark', name: 'Solarized Dark', scheme: 'dark',
    bg: '#002b36', sidebar: '#00252e', surface: '#073642',
    text: '#eee8d5', text2: '#93a1a1', text3: '#6c8387', border: '#0d3f4b', accent: '#2aa198',
    credit: 'Solarized',
  },
]

export const DEFAULT_LIGHT_THEME = 'paper'
export const DEFAULT_DARK_THEME = 'ink'

const THEME_INDEX = new Map(THEMES.map((t) => [t.id, t]))

export function getTheme(id: string, scheme: Scheme): Theme {
  const found = THEME_INDEX.get(id)
  if (found && found.scheme === scheme) return found
  return THEME_INDEX.get(scheme === 'dark' ? DEFAULT_DARK_THEME : DEFAULT_LIGHT_THEME)!
}

export function themesFor(scheme: Scheme): Theme[] {
  return THEMES.filter((t) => t.scheme === scheme)
}

// ---- Accents ----

// GNOME 47's accent set. Each was chosen upstream to work as a fill in both light and dark
// styles; as *text* the reading view nudges it for contrast (color.ensureContrast).
export interface Accent {
  id: string
  name: string
  color: string
}

export const ACCENTS: Accent[] = [
  { id: 'blue', name: 'Blue', color: '#3584e4' },
  { id: 'teal', name: 'Teal', color: '#2190a4' },
  { id: 'green', name: 'Green', color: '#3a944a' },
  { id: 'yellow', name: 'Yellow', color: '#c88800' },
  { id: 'orange', name: 'Orange', color: '#ed5b00' },
  { id: 'red', name: 'Red', color: '#e62d42' },
  { id: 'pink', name: 'Pink', color: '#d56199' },
  { id: 'purple', name: 'Purple', color: '#9141ac' },
  { id: 'slate', name: 'Slate', color: '#6f8396' },
]

/** Accent choices that are not a fixed colour. */
export const ACCENT_THEME = 'theme'
export const ACCENT_WALLPAPER = 'wallpaper'

export function accentPreset(id: string): Accent | undefined {
  return ACCENTS.find((a) => a.id === id)
}

// ---- Fonts ----

export interface FontChoice {
  id: string
  name: string
  stack: string
  /** Shown as a big "Ag" tile in the popup and the in-page view menu. */
  featured?: boolean
  /** One-line description for the settings list. */
  note: string
  /** Heading weight. The bundled faces only ship up to 500, and asking for more makes
   *  Chrome smear a synthetic bold over them; system fonts have real bold cuts. */
  titleWeight: number
}

// The three featured faces ship with the extension, so they look the same on every
// machine. The rest are Modern Font Stacks: a list per style that resolves to a good
// font already installed on Windows, macOS, Linux and ChromeOS without downloading one.
export const FONTS: FontChoice[] = [
  { id: 'sans', name: 'Sans', featured: true, titleWeight: 500, note: 'Inter Tight · clean and compact',
    stack: '"Inter Tight", ui-sans-serif, system-ui, sans-serif' },
  { id: 'serif', name: 'Serif', featured: true, titleWeight: 600, note: 'Newsreader · bookish and calm',
    stack: '"Newsreader", ui-serif, Georgia, serif' },
  { id: 'mono', name: 'Mono', featured: true, titleWeight: 500, note: 'IBM Plex Mono · even and technical',
    stack: '"IBM Plex Mono", ui-monospace, monospace' },
  { id: 'system', name: 'System', titleWeight: 700, note: "Your operating system's interface font",
    stack: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  { id: 'humanist', name: 'Humanist', titleWeight: 700, note: 'Warm and friendly sans',
    stack: 'Seravek, "Gill Sans Nova", Ubuntu, Calibri, "DejaVu Sans", source-sans-pro, sans-serif' },
  { id: 'rounded', name: 'Rounded', titleWeight: 700, note: 'Soft, rounded letterforms',
    // Candara rather than Calibri on Windows: Humanist ends there too, and the two
    // styles were the same font.
    stack: 'ui-rounded, "Hiragino Maru Gothic ProN", Quicksand, Comfortaa, Manjari, "Arial Rounded MT", "Arial Rounded MT Bold", Candara, source-sans-pro, sans-serif' },
  { id: 'grotesk', name: 'Grotesk', titleWeight: 700, note: 'Helvetica and friends',
    stack: '"Helvetica Neue", Helvetica, Arial, "Nimbus Sans", "Liberation Sans", sans-serif' },
  { id: 'verdana', name: 'Verdana', titleWeight: 700, note: 'Wide and very legible',
    stack: 'Verdana, Geneva, "DejaVu Sans", Tahoma, sans-serif' },
  { id: 'classic', name: 'Classic', titleWeight: 600, note: 'Georgia and Times',
    stack: 'Georgia, "Times New Roman", Times, serif' },
  { id: 'oldstyle', name: 'Old Style', titleWeight: 600, note: 'Palatino, Garamond - like a novel',
    stack: '"Iowan Old Style", "Palatino Linotype", "URW Palladio L", P052, Garamond, serif' },
  { id: 'slab', name: 'Slab', titleWeight: 600, note: 'Sturdy slab serif',
    stack: 'Rockwell, "Rockwell Nova", "Roboto Slab", "DejaVu Serif", "Sitka Small", serif' },
  { id: 'typewriter', name: 'Typewriter', titleWeight: 700, note: 'Courier',
    stack: '"Courier Prime", Courier, "Courier New", monospace' },
]

export const DEFAULT_FONT = 'sans'

export function getFont(id: string): FontChoice {
  return FONTS.find((f) => f.id === id) ?? FONTS.find((f) => f.id === DEFAULT_FONT)!
}

/** The interface font: labels, navigation, buttons. Notion's own stack. */
export const UI_FONT =
  'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", "Inter Tight", Helvetica, Arial, sans-serif'

export const MONO_FONT = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

// ---- Built-in wallpapers ----

export type PresetKind = 'gradient' | 'pattern' | 'animated'

export interface WallpaperPreset {
  id: string
  name: string
  kind: PresetKind
  /** A CSS `background` value. Patterns draw with theme variables so they follow it. */
  css: string
  /** For animated presets: the background-size the keyframes move across. */
  size?: string
  /** Tone used for the instant placeholder and the "accent from wallpaper" option. */
  average: string
  vibrant: string
}

// Patterns reference --df-pattern (the theme's ink at low alpha) and --df-bg, both set by
// the appearance layer, so a dot grid is dark-on-light in Paper and light-on-dark in Ink
// without a second copy of it.
export const WALLPAPER_PRESETS: WallpaperPreset[] = [
  {
    id: 'aurora', name: 'Aurora', kind: 'gradient', average: '#16304a', vibrant: '#6d28d9',
    css: 'radial-gradient(at 18% 22%, #1f6f8b 0, transparent 52%), radial-gradient(at 82% 8%, #6d28d9 0, transparent 55%), radial-gradient(at 70% 85%, #0ea5a4 0, transparent 52%), #0b1020',
  },
  {
    id: 'dusk', name: 'Dusk', kind: 'gradient', average: '#c9647f', vibrant: '#ff6a88',
    css: 'linear-gradient(160deg, #ff9a8b 0%, #ff6a88 45%, #7f5a83 100%)',
  },
  {
    id: 'meadow', name: 'Meadow', kind: 'gradient', average: '#d8ebcf', vibrant: '#6aa84f',
    css: 'radial-gradient(at 10% 90%, #b5dba0 0, transparent 55%), radial-gradient(at 90% 10%, #f3e3a0 0, transparent 50%), linear-gradient(180deg, #eaf5e2, #d3ebcf)',
  },
  {
    id: 'ocean', name: 'Ocean', kind: 'gradient', average: '#1d3943', vibrant: '#2c7a9b',
    css: 'linear-gradient(200deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
  },
  {
    id: 'peach', name: 'Peach', kind: 'gradient', average: '#fdd1b8', vibrant: '#f4845f',
    css: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
  },
  {
    id: 'lavender', name: 'Lavender', kind: 'gradient', average: '#e2d9fb', vibrant: '#9d6ff0',
    css: 'radial-gradient(at 0% 0%, #e0c3fc 0, transparent 60%), radial-gradient(at 100% 100%, #8ec5fc 0, transparent 60%), #f3e8ff',
  },
  {
    id: 'ember', name: 'Ember', kind: 'gradient', average: '#3a1a0f', vibrant: '#f97316',
    css: 'radial-gradient(at 30% 110%, #f97316 0, transparent 55%), radial-gradient(at 90% 0%, #7c2d12 0, transparent 60%), #1c0f0a',
  },
  {
    id: 'slate', name: 'Slate', kind: 'gradient', average: '#2f343d', vibrant: '#6f8396',
    css: 'linear-gradient(180deg, #454c59 0%, #1f232a 100%)',
  },
  {
    id: 'dots', name: 'Dot grid', kind: 'pattern', average: '#808080', vibrant: '#808080',
    css: 'radial-gradient(var(--df-pattern) 1.1px, transparent 1.4px) 0 0 / 22px 22px, var(--df-wall-base)',
  },
  {
    id: 'grid', name: 'Blueprint', kind: 'pattern', average: '#808080', vibrant: '#808080',
    css: 'linear-gradient(var(--df-pattern) 1px, transparent 1px) 0 0 / 32px 32px, linear-gradient(90deg, var(--df-pattern) 1px, transparent 1px) 0 0 / 32px 32px, var(--df-wall-base)',
  },
  {
    id: 'ruled', name: 'Ruled', kind: 'pattern', average: '#808080', vibrant: '#808080',
    css: 'repeating-linear-gradient(180deg, transparent 0 35px, var(--df-pattern) 35px 36px), var(--df-wall-base)',
  },
  {
    id: 'aurora-live', name: 'Aurora Live', kind: 'animated', average: '#1b3050', vibrant: '#6d28d9',
    css: 'linear-gradient(120deg, #0b1020, #1f6f8b, #6d28d9, #0ea5a4, #0b1020)',
    size: '400% 400%',
  },
  {
    id: 'sunset-live', name: 'Sunset Live', kind: 'animated', average: '#d0707e', vibrant: '#ff6a88',
    css: 'linear-gradient(135deg, #ff9a8b, #ff6a88, #7f5a83, #ffb88c, #ff9a8b)',
    size: '400% 400%',
  },
  {
    id: 'lava-live', name: 'Lava Lamp', kind: 'animated', average: '#2a1840', vibrant: '#f472b6',
    css: 'radial-gradient(circle at center, #f472b6 0, transparent 38%), radial-gradient(circle at center, #818cf8 0, transparent 40%), radial-gradient(circle at center, #fb923c 0, transparent 34%), #1a1033',
    size: '160% 160%, 150% 150%, 170% 170%, auto',
  },
]

export function getPreset(id: string): WallpaperPreset | undefined {
  return WALLPAPER_PRESETS.find((p) => p.id === id)
}
