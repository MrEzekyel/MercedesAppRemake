import { Tabs } from "expo-router";
import { AppTabBar, type TabName } from "../../src/components/AppTabBar";
import { TAB_SCENE, useCarTransition } from "../../src/components/CarTransition";

/**
 * Tutte e tre le schermate hanno la fotografia a tutto schermo e si
 * disegnano l'intestazione da sole: nessuna header di sistema. La tab bar
 * e' AppTabBar, la stessa del dettaglio veicolo e del video di transizione;
 * cambiare tab passa dalla transizione video fra le due schermate.
 */
export default function TabsLayout() {
  const { play } = useCarTransition();

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigation }) => {
        const current = state.routes[state.index].name as TabName;
        return (
          <AppTabBar
            active={current}
            onSelect={(name) => {
              if (name === current) return;
              play(TAB_SCENE[current], TAB_SCENE[name], () => navigation.navigate(name));
            }}
          />
        );
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Auto" }} />
      <Tabs.Screen name="trips" options={{ title: "Viaggi" }} />
      <Tabs.Screen name="vehicle-info" options={{ title: "Info veicolo" }} />
    </Tabs>
  );
}
