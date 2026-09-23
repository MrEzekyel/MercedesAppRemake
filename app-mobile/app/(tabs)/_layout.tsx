import { Tabs } from "expo-router";
import { AppTabBar, type TabName } from "../../src/components/AppTabBar";

/**
 * Tutte e tre le schermate hanno la fotografia a tutto schermo e si
 * disegnano l'intestazione da sole: nessuna header di sistema. La tab bar
 * e' AppTabBar, la stessa del dettaglio veicolo e del video di transizione.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigation }) => (
        <AppTabBar
          active={state.routes[state.index].name as TabName}
          onSelect={(name) => navigation.navigate(name)}
        />
      )}
    >
      <Tabs.Screen name="index" options={{ title: "Auto" }} />
      <Tabs.Screen name="trips" options={{ title: "Viaggi" }} />
      <Tabs.Screen name="vehicle-info" options={{ title: "Info veicolo" }} />
    </Tabs>
  );
}
