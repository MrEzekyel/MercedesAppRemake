/**
 * Copia questo file in config.ts (gitignored) e compilalo con i tuoi valori
 * reali. config.ts non va mai committato: contiene il token che apre
 * l'accesso al tuo backend.
 *
 * API_BASE_URL: il backend sempre acceso. In produzione e' un VPS (es.
 * https://mb.andreadecaro.it); per sviluppo locale contro un backend
 * avviato a mano sul Mac, usa l'IP del Mac sulla rete WiFi di casa (non
 * "localhost": il telefono e' un dispositivo diverso) — lo trovi con
 * `ipconfig getifaddr en0` nel terminale del Mac.
 */
export const API_BASE_URL = "https://mb.andreadecaro.it";
export const API_AUTH_TOKEN = "lo-stesso-valore-di-API_AUTH_TOKEN-nel-.env-del-backend";
