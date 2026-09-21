import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../theme";

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  active?: boolean;
  /** I comandi remoti non sono ancora implementati lato backend: i bottoni
   *  restano visibili (e' cosi' che sara' il layout finale) ma disattivi,
   *  con un'etichetta che lo dice chiaramente invece di sembrare rotti. */
  comingSoon?: boolean;
}

export function QuickActionButton({ icon, label, onPress, active, comingSoon }: Props) {
  return (
    <Pressable
      onPress={comingSoon ? undefined : onPress}
      disabled={comingSoon}
      style={({ pressed }) => [styles.wrapper, pressed && !comingSoon && styles.pressed]}
    >
      <View style={[styles.circle, active && styles.circleActive]}>
        <Ionicons
          name={icon}
          size={24}
          color={comingSoon ? colors.textTertiary : active ? colors.accent : colors.textPrimary}
        />
      </View>
      <Text style={[styles.label, comingSoon && styles.labelDisabled]}>
        {comingSoon ? "Presto" : label}
      </Text>
    </Pressable>
  );
}

const CIRCLE_SIZE = 56;

const styles = StyleSheet.create({
  wrapper: { alignItems: "center", gap: spacing.xs, width: 72 },
  pressed: { opacity: 0.6 },
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  circleActive: { backgroundColor: "rgba(58,160,255,0.15)" },
  label: { ...typography.caption, color: colors.textSecondary, textAlign: "center" },
  labelDisabled: { color: colors.textTertiary },
});
