import { Tabs } from "expo-router";
import { OdometerIcon, RouteIcon, TireIcon } from "../../src/components/icons";
import { colors } from "../../src/theme";

/**
 * Tutte e tre le schermate hanno la fotografia a tutto schermo e si
 * disegnano l'intestazione da sole: nessuna header di sistema, e la tab bar
 * e' trasparente per non tagliare l'immagine con una fascia piena.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: "rgba(6,9,16,0.82)",
          borderTopColor: "rgba(255,255,255,0.08)",
        },
        tabBarActiveTintColor: colors.textPrimary,
        tabBarInactiveTintColor: "rgba(255,255,255,0.38)",
        tabBarLabelStyle: { fontSize: 10, letterSpacing: 0.4, fontWeight: "500" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Auto",
          tabBarIcon: ({ color }) => <OdometerIcon size={21} color={color} strokeWidth={1.4} />,
        }}
      />
      <Tabs.Screen
        name="trips"
        options={{
          title: "Viaggi",
          tabBarIcon: ({ color }) => <RouteIcon size={21} color={color} strokeWidth={1.4} />,
        }}
      />
      <Tabs.Screen
        name="vehicle-info"
        options={{
          title: "Info veicolo",
          tabBarIcon: ({ color }) => <TireIcon size={21} color={color} strokeWidth={1.4} />,
        }}
      />
    </Tabs>
  );
}
