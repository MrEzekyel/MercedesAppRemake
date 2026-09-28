import CoreLocation
import Foundation

/// Lo stato dell'auto come lo restituisce `GET /api/state` (solo i campi
/// che servono ai widget).
struct VehicleState: Decodable {
  let vin: String
  let displayName: String?
  let updatedAt: String?
  let latitude: Double?
  let longitude: Double?
  let fuelLevelPct: Double?
  let rangeKm: Double?
  let doorsLocked: Bool?
  let openings: [String: String]?
  let tirePressures: [String: Double]?
  let warnings: [String: Bool]?
}

struct SavedPlace: Decodable {
  let name: String
  let latitude: Double
  let longitude: Double
  let radiusM: Double
}

struct CommandStatus: Decodable {
  let status: String
  let error: String?
}

private struct CommandAccepted: Decodable {
  let commandId: String
}

struct ApiError: Error, CustomLocalizedStringResourceConvertible {
  let message: String
  var localizedStringResource: LocalizedStringResource { LocalizedStringResource(stringLiteral: message) }
}

/// Client minimo del backend (lo stesso dell'app, vedi src/api.ts).
enum MBApi {
  private static let decoder: JSONDecoder = {
    let d = JSONDecoder()
    d.keyDecodingStrategy = .convertFromSnakeCase
    return d
  }()

  private static func request(_ path: String, method: String = "GET") async throws -> Data {
    guard !Secrets.baseURL.isEmpty, let url = URL(string: Secrets.baseURL + path) else {
      throw ApiError(message: "Backend non configurato")
    }
    var req = URLRequest(url: url, timeoutInterval: 15)
    req.httpMethod = method
    req.setValue("Bearer \(Secrets.token)", forHTTPHeaderField: "Authorization")
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    let (data, response) = try await URLSession.shared.data(for: req)
    guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
      throw ApiError(message: "Backend non raggiungibile")
    }
    return data
  }

  static func state() async throws -> VehicleState {
    let rows = try decoder.decode([VehicleState].self, from: try await request("/api/state"))
    guard let first = rows.first else { throw ApiError(message: "Nessuna auto") }
    return first
  }

  static func places() async throws -> [SavedPlace] {
    try decoder.decode([SavedPlace].self, from: try await request("/api/places"))
  }

  /// Chiude o apre e aspetta la conferma dell'auto (al massimo ~24 s: le
  /// azioni dei controlli hanno poco tempo per finire).
  static func setLocked(_ locked: Bool, vin: String) async throws {
    let path = "/api/vehicles/\(vin)/\(locked ? "lock" : "unlock")"
    let accepted = try decoder.decode(CommandAccepted.self, from: try await request(path, method: "POST"))
    for _ in 0..<12 {
      try await Task.sleep(for: .seconds(2))
      guard let data = try? await request("/api/commands/\(accepted.commandId)"),
            let status = try? decoder.decode(CommandStatus.self, from: data)
      else { continue }
      if status.status == "completed" { return }
      if status.status == "failed" {
        throw ApiError(message: status.error ?? "L'auto ha rifiutato il comando")
      }
    }
    // Nessuna conferma in tempo: il comando e' partito, l'esito arrivera'
    // con il prossimo aggiornamento dello stato.
  }
}

// MARK: - Stato atteso dopo un comando

/// Dopo un comando l'auto conferma subito, ma lo stato delle porte arriva
/// qualche secondo dopo: per un minuto widget e controllo mostrano quello
/// appena chiesto invece di tornare indietro per un attimo.
enum PendingLock {
  private static let key = "pendingLock"
  private static let untilKey = "pendingLockUntil"

  static func set(_ locked: Bool) {
    UserDefaults.standard.set(locked, forKey: key)
    UserDefaults.standard.set(Date().addingTimeInterval(60).timeIntervalSince1970, forKey: untilKey)
  }

  static func apply(to locked: Bool?) -> Bool? {
    let until = UserDefaults.standard.double(forKey: untilKey)
    guard until > Date().timeIntervalSince1970 else { return locked }
    return UserDefaults.standard.bool(forKey: key)
  }
}

// MARK: - Dove si trova

enum Whereabouts {
  /// Il luogo salvato (Casa, Lavoro...) che contiene l'auto, altrimenti
  /// la via con il numero civico.
  static func label(for state: VehicleState, places: [SavedPlace]) async -> String? {
    guard let lat = state.latitude, let lon = state.longitude else { return nil }
    let car = CLLocation(latitude: lat, longitude: lon)
    let inside = places
      .map { ($0, car.distance(from: CLLocation(latitude: $0.latitude, longitude: $0.longitude))) }
      .filter { $0.1 <= $0.0.radiusM }
      .min { $0.1 < $1.1 }
    if let inside { return inside.0.name }
    guard let mark = try? await CLGeocoder().reverseGeocodeLocation(car).first else { return nil }
    if let street = mark.thoroughfare {
      return [abbreviated(street), mark.subThoroughfare].compactMap { $0 }.joined(separator: " ")
    }
    return mark.locality ?? mark.name
  }

  /// "Viale Charles Lenormant" -> "V.le Charles Lenormant": nel widget lo
  /// spazio e' poco e le abbreviazioni sono quelle dei cartelli.
  private static func abbreviated(_ street: String) -> String {
    let prefixes = [("Viale ", "V.le "), ("Piazzale ", "P.le "), ("Piazza ", "P.za "), ("Corso ", "C.so "),
                    ("Largo ", "L.go "), ("Lungotevere ", "Lungot. "), ("Circonvallazione ", "Circ.ne ")]
    for (long, short) in prefixes where street.hasPrefix(long) {
      return short + street.dropFirst(long.count)
    }
    return street
  }
}

// MARK: - Date del backend

enum BackendDate {
  /// Il backend manda i microsecondi ("…57.346328Z"): se il formattatore
  /// non li accetta, si riprova senza la parte frazionaria.
  static func parse(_ text: String?) -> Date? {
    guard let text else { return nil }
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let plain = ISO8601DateFormatter()
    if let date = fractional.date(from: text) ?? plain.date(from: text) { return date }
    let trimmed = text.replacingOccurrences(of: #"\.\d+"#, with: "", options: .regularExpression)
    return plain.date(from: trimmed)
  }
}
