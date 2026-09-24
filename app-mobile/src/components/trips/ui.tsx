/**
 * Mattoni grafici del resoconto viaggi.
 *
 * Tutte le schermate di Viaggi (panoramica, consumi, abitudini, record,
 * confronto, dettaglio) li usano invece di stili propri: stesse etichette
 * maiuscole spaziate, stessi numeri sottili, stesse linee sottili al posto
 * delle card. E' questo che le fa sembrare un'unica sezione.
 */
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { colors, radius, spacing } from "../../theme";
import { BulbIcon, ChevronIcon, ChevronLeftIcon, PathIcon } from "../icons";

export const HAIRLINE = "rgba(255,255,255,0.12)";
export const HAIRLINE_SOFT = "rgba(255,255,255,0.08)";
export const GOOD = colors.success;
export const WARN = colors.warning;
export const ACCENT_LIGHT = "#7fb0e3";

export const type = StyleSheet.create({
  eyebrow: { fontSize: 10, fontWeight: "600", letterSpacing: 1.4, color: colors.textTertiary },
  section: { fontSize: 20, fontWeight: "600", color: colors.textPrimary, letterSpacing: -0.2 },
  body: { fontSize: 15, color: colors.textPrimary },
  secondary: { fontSize: 13, color: colors.textSecondary },
  caption: { fontSize: 12, color: colors.textTertiary },
  kpi: { fontSize: 24, fontWeight: "300", color: colors.textPrimary, letterSpacing: -0.3 },
  unit: { fontSize: 13, fontWeight: "400", color: colors.textSecondary, letterSpacing: 0 },
});

export function Eyebrow({ children, color, style }: { children: ReactNode; color?: string; style?: StyleProp<TextStyle> }) {
  return <Text style={[type.eyebrow, color ? { color } : null, style]}>{children}</Text>;
}

export function SectionHeader({ title, right, onRight }: { title: string; right?: string; onRight?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={type.section}>{title}</Text>
      {right != null &&
        (onRight ? (
          <Pressable onPress={onRight} hitSlop={10}>
            <Text style={styles.link}>{right}</Text>
          </Pressable>
        ) : (
          <Text style={type.caption}>{right}</Text>
        ))}
    </View>
  );
}

/** Il numero protagonista: grande e sottile, unita' piccola accanto. */
export function BigFigure({ value, unit, size = 64 }: { value: string; unit?: string; size?: number }) {
  return (
    <View style={styles.bigRow}>
      <Text style={[styles.big, { fontSize: size, letterSpacing: -size / 32 }]}>{value}</Text>
      {unit ? <Text style={styles.bigUnit}>{unit}</Text> : null}
    </View>
  );
}

/**
 * Variazione rispetto al periodo precedente. Verde solo dove scendere e'
 * un bene (consumo, costo al km); km e ore in piu' non sono ne' bene ne' male.
 */
export function DeltaPill({ text, tone = "neutral" }: { text: string; tone?: "neutral" | "good" | "warn" }) {
  const color = tone === "good" ? GOOD : tone === "warn" ? WARN : ACCENT_LIGHT;
  const bg = tone === "good" ? "rgba(52,199,89,0.12)" : tone === "warn" ? "rgba(224,166,60,0.12)" : colors.accentSoft;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color }]}>{text}</Text>
    </View>
  );
}

export interface SegmentOption<K extends string> {
  key: K;
  label: string;
}

/** Selettore a pillola: periodo, unita', tipo di confronto. */
export function Segmented<K extends string>({
  options, value, onChange, small,
}: { options: SegmentOption<K>[]; value: K; onChange: (k: K) => void; small?: boolean }) {
  return (
    <View style={[styles.segmented, small && styles.segmentedSmall]}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={[styles.segment, small && styles.segmentSmall, on && styles.segmentOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.segmentText, small && styles.segmentTextSmall, on && styles.segmentTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Pillole singole, per scegliere cosa mostra un grafico. */
export function Chips<K extends string>({
  options, value, onChange,
}: { options: SegmentOption<K>[]; value: K; onChange: (k: K) => void }) {
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable key={o.key} onPress={() => onChange(o.key)} style={[styles.chip, on && styles.chipOn]} accessibilityRole="tab">
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** "‹  SETTEMBRE 2026 · 1–24  ›" */
export function PeriodNav({
  caption, onPrev, onNext, canPrev = true, canNext,
}: { caption: string; onPrev: () => void; onNext: () => void; canPrev?: boolean; canNext: boolean }) {
  return (
    <View style={styles.periodNav}>
      <Pressable onPress={onPrev} disabled={!canPrev} hitSlop={8} style={[styles.navBtn, !canPrev && styles.dim]} accessibilityLabel="Periodo precedente">
        <ChevronLeftIcon size={18} color={colors.textSecondary} strokeWidth={1.6} />
      </Pressable>
      <Text style={styles.periodCaption}>{caption}</Text>
      <Pressable onPress={onNext} disabled={!canNext} hitSlop={8} style={[styles.navBtn, !canNext && styles.dim]} accessibilityLabel="Periodo successivo">
        <ChevronIcon size={18} color={colors.textSecondary} strokeWidth={1.6} />
      </Pressable>
    </View>
  );
}

export interface StatCell {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  subTone?: "neutral" | "good" | "warn";
  onPress?: () => void;
}

/** Numeri in griglia separati da linee sottili, senza card. */
export function StatGrid({ cells, columns = 2 }: { cells: StatCell[]; columns?: number }) {
  const rows = Math.ceil(cells.length / columns);
  return (
    <View style={styles.grid}>
      {cells.map((c, i) => {
        const col = i % columns;
        const row = Math.floor(i / columns);
        const cellStyle: ViewStyle = {
          width: `${100 / columns}%`,
          borderRightWidth: col < columns - 1 ? 1 : 0,
          borderBottomWidth: row < rows - 1 ? 1 : 0,
          paddingLeft: col === 0 ? 0 : spacing.md,
        };
        const subColor = c.subTone === "good" ? GOOD : c.subTone === "warn" ? WARN : colors.textSecondary;
        return (
          <Pressable key={c.label} onPress={c.onPress} disabled={!c.onPress} style={[styles.cell, cellStyle]}>
            <Eyebrow>{c.label}</Eyebrow>
            <Text style={type.kpi} numberOfLines={1} adjustsFontSizeToFit>
              {c.value}
              {c.unit ? <Text style={type.unit}> {c.unit}</Text> : null}
            </Text>
            {c.sub ? <Text style={[styles.cellSub, { color: subColor }]} numberOfLines={1}>{c.sub}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Riga che porta a un'altra pagina. */
export function NavRow({
  icon, title, caption, onPress, last,
}: { icon: ReactNode; title: string; caption?: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.navRow, !last && styles.navRowLine, pressed && styles.pressed]}>
      {icon}
      <Text style={[type.body, styles.flex]}>{title}</Text>
      {caption ? <Text style={type.caption}>{caption}</Text> : null}
      <ChevronIcon size={16} color={colors.textTertiary} strokeWidth={1.6} />
    </Pressable>
  );
}

/** La frase "che ti dice qualcosa": una sola, in evidenza tenue. */
export function Insight({ text, onPress }: { text: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.insight, pressed && styles.pressed]}>
      <View style={styles.insightIcon}>
        <BulbIcon size={17} color={WARN} strokeWidth={1.6} />
      </View>
      <Text style={styles.insightText}>{text}</Text>
      {onPress ? <ChevronIcon size={16} color={colors.textTertiary} strokeWidth={1.6} /> : null}
    </Pressable>
  );
}

export function Dot({ color, size = 6 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

/** Icona di un luogo nel suo cerchio colorato. */
export function PlaceGlyph({ d, color, size = 36 }: { d: string; color: string; size?: number }) {
  return (
    <View style={[styles.glyph, { width: size, height: size, borderRadius: size / 2, backgroundColor: softColor(color) }]}>
      <PathIcon d={d} size={size * 0.47} color={color} strokeWidth={1.7} />
    </View>
  );
}

export function softColor(hex: string, alpha = 0.16): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Barra "‹ Viaggi · Titolo · azione" delle pagine di approfondimento. */
export function SubPageBar({ title, onBack, backLabel = "Viaggi", right }: { title: string; onBack: () => void; backLabel?: string; right?: ReactNode }) {
  return (
    <View style={styles.subBar}>
      <Pressable onPress={onBack} hitSlop={8} style={styles.back} accessibilityRole="button" accessibilityLabel={`Torna a ${backLabel}`}>
        <ChevronLeftIcon size={20} color={colors.accent} strokeWidth={1.8} />
        <Text style={styles.backText}>{backLabel}</Text>
      </Pressable>
      <Text style={styles.subTitle} numberOfLines={1}>{title}</Text>
      <View style={styles.subRight}>{right}</View>
    </View>
  );
}

/** Pillola piccola a destra della barra (es. "3 mesi"). */
export function SmallPill({ label, onPress }: { label: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={styles.smallPill}>
      <Text style={styles.smallPillText}>{label}</Text>
    </Pressable>
  );
}

export function EmptyNote({ text }: { text: string }) {
  return <Text style={styles.empty}>{text}</Text>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  dim: { opacity: 0.3 },
  link: { fontSize: 14, color: colors.accent },
  sectionHeader: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },

  bigRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  big: { fontWeight: "200", color: colors.textPrimary },
  bigUnit: { fontSize: 20, fontWeight: "300", color: colors.textSecondary },

  pill: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  pillText: { fontSize: 12, fontWeight: "600" },

  segmented: {
    flexDirection: "row",
    padding: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: HAIRLINE,
  },
  segmentedSmall: { alignSelf: "center" },
  segment: { flex: 1, height: 32, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  segmentSmall: { flex: 0, height: 26, paddingHorizontal: 12 },
  segmentOn: { backgroundColor: "rgba(255,255,255,0.12)" },
  segmentText: { fontSize: 13, fontWeight: "500", color: colors.textSecondary },
  segmentTextSmall: { fontSize: 12 },
  segmentTextOn: { color: colors.textPrimary, fontWeight: "600" },

  chips: { flexDirection: "row", gap: 6 },
  chip: { height: 30, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: HAIRLINE, justifyContent: "center" },
  chipOn: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  chipTextOn: { color: colors.background },

  periodNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  navBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  periodCaption: { fontSize: 12, fontWeight: "600", letterSpacing: 1.6, color: colors.textSecondary },

  grid: { flexDirection: "row", flexWrap: "wrap", borderTopWidth: 1, borderBottomWidth: 1, borderColor: HAIRLINE },
  cell: { paddingVertical: spacing.md, paddingRight: 4, gap: 4, borderColor: HAIRLINE },
  cellSub: { fontSize: 12 },

  navRow: { flexDirection: "row", alignItems: "center", gap: 14, height: 56 },
  navRowLine: { borderBottomWidth: 1, borderBottomColor: HAIRLINE_SOFT },

  insight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: HAIRLINE,
  },
  insightIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(224,166,60,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  insightText: { flex: 1, fontSize: 14, lineHeight: 19, color: "rgba(255,255,255,0.86)" },

  glyph: { alignItems: "center", justifyContent: "center" },

  subBar: { flexDirection: "row", alignItems: "center", height: 44, marginTop: spacing.sm },
  back: { flexDirection: "row", alignItems: "center", gap: 2, marginLeft: -6, minWidth: 80 },
  backText: { fontSize: 15, color: colors.accent },
  subTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "600", color: colors.textPrimary },
  subRight: { minWidth: 80, alignItems: "flex-end" },

  smallPill: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: HAIRLINE,
    backgroundColor: colors.surface,
    justifyContent: "center",
  },
  smallPillText: { fontSize: 13, fontWeight: "500", color: colors.textPrimary },

  empty: { fontSize: 13, lineHeight: 19, color: colors.textTertiary, textAlign: "center", paddingVertical: spacing.lg },
});
