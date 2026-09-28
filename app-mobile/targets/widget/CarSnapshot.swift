import Foundation

/// Quello che il widget mostra, gia' tradotto in parole.
struct CarSnapshot: Codable {
  var name: String
  var rangeKm: Int?
  var fuelPct: Double?
  var locked: Bool?
  var place: String?
  var updatedAt: Date?
  var alert: String?
  var lowFuel: Bool

  static let preview = CarSnapshot(
    name: "Classe A", rangeKm: 412, fuelPct: 58, locked: true, place: "Casa",
    updatedAt: Date(), alert: nil, lowFuel: false
  )
}

extension CarSnapshot {
  init(state: VehicleState, place: String?) {
    let fuel = state.fuelLevelPct
    let range = state.rangeKm.map { Int($0.rounded()) }
    let lowFuel = (fuel.map { $0 <= 10 } ?? false) || (range.map { $0 <= 60 } ?? false)
    self.init(
      name: Self.shortName(state.displayName),
      rangeKm: range,
      fuelPct: fuel,
      locked: PendingLock.apply(to: state.doorsLocked),
      place: place,
      updatedAt: BackendDate.parse(state.updatedAt),
      alert: Alerts.first(in: state, lowFuel: lowFuel),
      lowFuel: lowFuel
    )
  }

  /// "Classe A Premium" -> "Classe A": l'allestimento nel widget e' rumore.
  private static func shortName(_ name: String?) -> String {
    guard let name, !name.isEmpty else { return "Classe A" }
    let words = name.split(separator: " ")
    return words.count > 2 ? words.prefix(2).joined(separator: " ") : name
  }
}

// MARK: - Cache

/// L'ultimo stato letto: se il backend non risponde il widget mostra
/// questo (con la sua ora) invece di svuotarsi.
enum SnapshotCache {
  private static let key = "lastSnapshot"

  static func save(_ snapshot: CarSnapshot) {
    if let data = try? JSONEncoder().encode(snapshot) {
      UserDefaults.standard.set(data, forKey: key)
    }
  }

  static func load() -> CarSnapshot? {
    guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
    return try? JSONDecoder().decode(CarSnapshot.self, from: data)
  }
}

// MARK: - Avvisi

/// Il primo avviso da mostrare, in ordine di urgenza: aperture, spie,
/// gomme, riserva. Se ce ne sono altri si aggiunge "+N".
enum Alerts {
  private static let sides: [String: String] = [
    "frontleft": "ant. sx", "frontright": "ant. dx", "rearleft": "post. sx", "rearright": "post. dx",
  ]
  private static let warningLabels: [String: String] = [
    "brakefluid": "Liquido freni basso",
    "coolantlow": "Liquido di raffreddamento basso",
    "enginelight": "Spia motore accesa",
    "washerfluid": "Liquido lavavetri basso",
    "brakepadwear": "Pastiglie freni usurate",
  ]

  /// Le chiavi arrivano come "door_front_left" o, a seconda del decoder,
  /// "doorFrontLeft": si confrontano senza trattini bassi ne' maiuscole.
  private static func norm(_ key: String) -> String {
    key.replacingOccurrences(of: "_", with: "").lowercased()
  }

  static func all(in state: VehicleState, lowFuel: Bool) -> [String] {
    var out: [String] = []
    let openings = Dictionary((state.openings ?? [:]).map { (norm($0.key), $0.value) }, uniquingKeysWith: { a, _ in a })

    let doors = sides.keys.sorted().filter { openings["door\($0)"] == "open" }
    if doors.count == 1, let side = sides[doors[0]] {
      out.append("Porta \(side) aperta")
    } else if doors.count > 1 {
      out.append("\(doors.count) porte aperte")
    }
    for (key, label) in [("hood", "Cofano aperto"), ("decklid", "Portellone aperto"), ("trunk", "Portellone aperto"),
                         ("sunroof", "Tetto aperto")] where openings[key] == "open" {
      if !out.contains(label) { out.append(label) }
    }
    let windows = sides.keys.sorted().filter { key in
      guard let value = openings["window\(key)"] else { return false }
      return value != "closed"
    }
    if windows.count == 1, let side = sides[windows[0]] {
      out.append("Finestrino \(side) aperto")
    } else if windows.count > 1 {
      out.append("\(windows.count) finestrini aperti")
    }

    for (key, on) in state.warnings ?? [:] where on {
      if let label = warningLabels[norm(key)] { out.append(label) }
    }

    let tires = Dictionary((state.tirePressures ?? [:]).map { (norm($0.key), $0.value) }, uniquingKeysWith: { a, _ in a })
    for key in sides.keys.sorted() {
      guard let bar = tires[key], let side = sides[key], bar < 1.8 || bar > 2.6 else { continue }
      out.append("Gomma \(side) \(String(format: "%.1f", bar).replacingOccurrences(of: ".", with: ",")) bar")
    }

    if lowFuel { out.append("Riserva: fai benzina") }
    return out
  }

  static func first(in state: VehicleState, lowFuel: Bool) -> String? {
    let list = all(in: state, lowFuel: lowFuel)
    guard let first = list.first else { return nil }
    return list.count > 1 ? "\(first) · +\(list.count - 1)" : first
  }
}
