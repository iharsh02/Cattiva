/** The one grey every chrome element uses: labels, borders, hints. */
export const DIM = "#808080";

/** Foreground for text that should read as primary rather than chrome. */
export const FG = "#e1e1e1";

/**
 * One step above the terminal backdrop. Everything the app lifts off the background —
 * a floating panel, a highlighted row — sits at this level, so nothing invents its own
 * grey and two raised things always read as the same material.
 */
export const SURFACE = "#202020";

/** Background of the selected row in a list. */
export const SELECTED_BG = SURFACE;

export const COLORS = {
  dim: DIM,
  fg: FG,
  selectedBg: SELECTED_BG,
  surface: SURFACE,

  // Status accents, held to roughly DIM's lightness so they read as siblings of the
  // grey chrome rather than as alerts pasted on top of it. There is deliberately no
  // "info" accent: a neutral notice is plain FG, so colour only ever means severity.
  success: "#7fa87f",
  warning: "#b39a63",
  error: "#b37f7f",
} as const;

export type Colors = typeof COLORS;

/**
 * One palette for now, behind a hook so a component never hardcodes a hex and a future
 * light/dark switch is a change here rather than everywhere.
 */
export function useTheme(): { colors: Colors } {
  return { colors: COLORS };
}
