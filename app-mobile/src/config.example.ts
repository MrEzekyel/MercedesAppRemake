/**
 * Copia questo file in config.ts (gitignored) e compilalo con i tuoi valori
 * reali. config.ts non va mai committato: contiene il token che apre
 * l'accesso al tuo backend.
 *
 * API_BASE_URL: in locale, l'IP del Mac sulla rete WiFi di casa (non
 * "localhost": il telefono e' un dispositivo diverso). Lo trovi con
 * `ipconfig getifaddr en0` nel terminale del Mac.
 */
export const API_BASE_URL = "http://192.168.1.XX:8000";
export const API_AUTH_TOKEN = "lo-stesso-valore-di-API_AUTH_TOKEN-nel-.env-del-backend";
