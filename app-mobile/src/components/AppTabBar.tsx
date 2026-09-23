import type { ComponentType } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing } from "../theme";
import { type IconProps, OdometerIcon, RouteIcon, TireIcon } from "./icons";

export type TabName = "index" | "trips" | "vehicle-info";

const TABS: { name: TabName; label: string; Icon: ComponentType<IconProps> }[] = [
  { name: "index", label: "Auto", Icon: OdometerIcon },
  { name: "trips", label: "Viaggi", Icon: RouteIcon },
  { name: "vehicle-info", label: "Info veicolo", Icon: TireIcon },
];

/**
 * Unica tab bar dell'app: la usano le tab vere, il dettaglio veicolo e il
 * video di transizione. Essendo lo stesso componente e' identica al pixel
 * in tutti e tre i casi, quindi al taglio video -> schermata non si sposta.
 */
export function AppTabBar({
  active,
  onSelect,
}: {
  active: TabName;
  onSelect?: (name: TabName) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom || spacing.sm }]}>
      {TABS.map(({ name, label, Icon }) => {
        const color = name === active ? colors.textPrimary : "rgba(255,255,255,0.38)";
        return (
          <Pressable
            key={name}
            onPress={() => onSelect?.(name)}
            style={styles.button}
            hitSlop={8}
            accessibilityRole="tab"
            accessibilityState={{ selected: name === active }}
          >
            <Icon size={21} color={color} strokeWidth={1.4} />
            <Text style={[styles.label, { color }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    backgroundColor: "rgba(6,9,16,0.82)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.08)",
    paddingTop: spacing.sm,
  },
  button: { flex: 1, alignItems: "center", gap: 3 },
  label: { fontSize: 10, letterSpacing: 0.4, fontWeight: "500" },
});
