/**
 * Blu notte profondo, non nero neutro: e' lo studio fotografico scuro dei
 * render Mercedes (tende verticali, luce blu soffusa), non una dashboard
 * SaaS. Un solo accento cromatico (l'azzurro), il resto e' bianco a
 * opacita' decrescente per la gerarchia.
 */
export const colors = {
  background: "#060910",
  backgroundBand: "#0B1220",
  surface: "rgba(255,255,255,0.055)",
  surfaceRaised: "rgba(255,255,255,0.08)",
  border: "rgba(255,255,255,0.12)",

  textPrimary: "#ffffff",
  textSecondary: "rgba(255,255,255,0.62)",
  textTertiary: "rgba(255,255,255,0.38)",

  accent: "#4F8FD1",
  accentGlow: "rgba(79,143,209,0.45)",
  accentSoft: "rgba(79,143,209,0.14)",
  success: "#34c759",
  warning: "#e0a63c",
  danger: "#c1554d",

  locked: "#4F8FD1",
  unlocked: "#c1554d",
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
