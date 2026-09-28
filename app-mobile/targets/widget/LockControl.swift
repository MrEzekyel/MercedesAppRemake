import AppIntents
import SwiftUI
import WidgetKit

/// Chiude o apre l'auto da schermata di blocco e Centro di Controllo.
///
/// "Acceso" vuol dire chiusa: lucchetto chiuso ed evidenziato. Il comando
/// chiede sempre lo sblocco del telefono (Face ID) se e' bloccato: iOS non
/// permette di chiederlo solo per l'apertura, e aprire l'auto da un
/// telefono lasciato sul tavolo non deve essere possibile.
struct LockControl: ControlWidget {
  static let kind = "it.andreadecaro.mbcompanion.lock"

  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: Self.kind, provider: LockValueProvider()) { locked in
      ControlWidgetToggle("Classe A", isOn: locked, action: SetCarLockedIntent()) { isOn in
        Label(isOn ? "Chiusa" : "Aperta", systemImage: isOn ? "lock.fill" : "lock.open.fill")
      }
      .tint(Palette.accent)
    }
    .displayName("Chiudi / apri auto")
    .description("Chiude o apre la Classe A e mostra se è chiusa.")
  }
}

struct LockValueProvider: ControlValueProvider {
  var previewValue: Bool { true }

  func currentValue() async throws -> Bool {
    if let state = try? await MBApi.state(), let locked = PendingLock.apply(to: state.doorsLocked) {
      return locked
    }
    // Backend irraggiungibile: l'ultimo stato noto, se c'e'.
    return PendingLock.apply(to: SnapshotCache.load()?.locked) ?? true
  }
}

struct SetCarLockedIntent: SetValueIntent {
  static let title: LocalizedStringResource = "Chiudi o apri la Classe A"
  static let description = IntentDescription("Manda all'auto il comando di chiusura o apertura.")
  static let authenticationPolicy: IntentAuthenticationPolicy = .requiresAuthentication

  @Parameter(title: "Chiusa")
  var value: Bool

  init() {}

  func perform() async throws -> some IntentResult {
    let state = try await MBApi.state()
    try await MBApi.setLocked(value, vin: state.vin)
    PendingLock.set(value)
    WidgetCenter.shared.reloadTimelines(ofKind: StatusWidget.kind)
    return .result()
  }
}
