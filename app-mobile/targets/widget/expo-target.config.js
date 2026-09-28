/**
 * Estensione dei widget: il widget Home "Studio" (stato dell'auto) e il
 * controllo chiudi/apri per schermata di blocco e Centro di Controllo.
 *
 * Il widget chiede i dati direttamente al backend, cosi' si aggiorna anche
 * ad app chiusa. Indirizzo e token li prende da src/config.ts (gitignored)
 * e li scrive in Config.generated.swift, gitignored anche lui: niente App
 * Group da condividere con l'app, che con la firma gratuita e' un punto
 * fragile in meno.
 */
const fs = require("fs");
const path = require("path");

function writeConfig() {
  const source = path.join(__dirname, "../../src/config.ts");
  const text = fs.existsSync(source) ? fs.readFileSync(source, "utf8") : "";
  const read = (name) => (text.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`)) ?? [])[1] ?? "";
  const swift = [
    "// Generato da expo-target.config.js a ogni prebuild: non modificare, non committare.",
    "enum Secrets {",
    `  static let baseURL = ${JSON.stringify(read("API_BASE_URL"))}`,
    `  static let token = ${JSON.stringify(read("API_AUTH_TOKEN"))}`,
    "}",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(__dirname, "Config.generated.swift"), swift);
}

writeConfig();

/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: "widget",
  name: "widget",
  displayName: "Classe A",
  deploymentTarget: "18.0",
  frameworks: ["SwiftUI", "WidgetKit", "AppIntents"],
  colors: {
    $widgetBackground: "#060910",
    $accent: "#4F8FD1",
  },
  images: {
    carSide: "../../assets/widget/car-side.jpg",
  },
};
