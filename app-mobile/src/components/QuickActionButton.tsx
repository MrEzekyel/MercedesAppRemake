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
      <View style={[styles.badge, active && styles.badgeActive]}>
        <Ionicons
          name={icon}
          size={19}
          color={comingSoon ? colors.textTertiary : active ? colors.accent : colors.textPrimary}
        />
      </View>
      <Text style={[styles.label, comingSoon && styles.labelDisabled]}>
        {comingSoon ? "Presto" : label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: "center", gap: spacing.xs, flex: 1 },
  pressed: { opacity: 0.6 },
  badge: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeActive: {
    backgroundColor: colors.accentSoft,
    borderColor: "rgba(79,143,209,0.5)",
    shadowColor: colors.accent,
    shadowOpacity: 0.6,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  label: { ...typography.caption, color: colors.textSecondary, textAlign: "center" },
  labelDisabled: { color: colors.textTertiary },
});
