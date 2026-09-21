/**
 * Nero quasi puro, non grigio: e' la differenza tra un'app che sembra scura
 * e una che sembra spenta. Un solo accento (l'azzurro dello stato "in
 * marcia"/attivo), il resto e' bianco a opacita' decrescente per la
 * gerarchia, come nell'app Tesla.
 */
export const colors = {
  background: "#000000",
  surface: "#111214",
  surfaceRaised: "#1c1d20",
  border: "#2a2b2e",

  textPrimary: "#ffffff",
  textSecondary: "rgba(255,255,255,0.6)",
  textTertiary: "rgba(255,255,255,0.38)",

  accent: "#3aa0ff",
  success: "#34c759",
  warning: "#ffb020",
  danger: "#ff453a",

  locked: "#34c759",
  unlocked: "#ffb020",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

export const typography = {
  hero: { fontSize: 34, fontWeight: "700" as const, letterSpacing: -0.5 },
  title: { fontSize: 20, fontWeight: "600" as const },
  body: { fontSize: 16, fontWeight: "400" as const },
  caption: { fontSize: 13, fontWeight: "500" as const },
  statValue: { fontSize: 22, fontWeight: "700" as const },
  statLabel: { fontSize: 12, fontWeight: "500" as const, letterSpacing: 0.3 },
};
