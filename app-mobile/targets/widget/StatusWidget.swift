import SwiftUI
import WidgetKit

// MARK: - Dati

struct StatusEntry: TimelineEntry {
  let date: Date
  let snapshot: CarSnapshot
}

struct StatusProvider: TimelineProvider {
  func placeholder(in context: Context) -> StatusEntry {
    StatusEntry(date: Date(), snapshot: .preview)
  }

  func getSnapshot(in context: Context, completion: @escaping (StatusEntry) -> Void) {
    if context.isPreview {
      completion(StatusEntry(date: Date(), snapshot: SnapshotCache.load() ?? .preview))
      return
    }
    Task { completion(StatusEntry(date: Date(), snapshot: await Self.load() ?? SnapshotCache.load() ?? .preview)) }
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<StatusEntry>) -> Void) {
    Task {
      let fresh = await Self.load()
      let snapshot = fresh ?? SnapshotCache.load() ?? .preview
      // Ogni 15 minuti (iOS decide quando davvero); se il backend non ha
      // risposto si riprova prima.
      let next = Date().addingTimeInterval(fresh == nil ? 5 * 60 : 15 * 60)
      completion(Timeline(entries: [StatusEntry(date: Date(), snapshot: snapshot)], policy: .after(next)))
    }
  }

  static func load() async -> CarSnapshot? {
    guard let state = try? await MBApi.state() else { return nil }
    let places = (try? await MBApi.places()) ?? []
    let snapshot = CarSnapshot(state: state, place: await Whereabouts.label(for: state, places: places))
    SnapshotCache.save(snapshot)
    return snapshot
  }
}

// MARK: - Widget

struct StatusWidget: Widget {
  nonisolated static let kind = "StatusWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: Self.kind, provider: StatusProvider()) { entry in
      StudioView(snapshot: entry.snapshot)
        .containerBackground(for: .widget) { Palette.background }
        .widgetURL(URL(string: "mbcompanion://"))
    }
    .configurationDisplayName("Stato auto")
    .description("Autonomia, carburante, chiusura e dove si trova la Classe A.")
    .supportedFamilies([.systemMedium])
    .contentMarginsDisabled()
  }
}

// MARK: - Aspetto (proposta "A · Studio")

enum Palette {
  static let background = Color(red: 6 / 255, green: 9 / 255, blue: 16 / 255)
  static let accent = Color(red: 79 / 255, green: 143 / 255, blue: 209 / 255)
  static let open = Color(red: 220 / 255, green: 107 / 255, blue: 98 / 255)
  static let warning = Color(red: 224 / 255, green: 166 / 255, blue: 60 / 255)
  static let secondary = Color.white.opacity(0.62)
  static let tertiary = Color.white.opacity(0.38)
}

/// La foto dell'auto a destra che sfuma nel blu notte, i numeri a sinistra:
/// autonomia in grande, barra del carburante, dove si trova e l'ora del
/// dato. Con un avviso la riga in basso diventa ambra e luogo e ora salgono
/// al posto del nome.
struct StudioView: View {
  let snapshot: CarSnapshot
  var car: Image = Image("carSide")

  @Environment(\.widgetRenderingMode) private var renderingMode

  private var fullColor: Bool { renderingMode == .fullColor }

  var body: some View {
    GeometryReader { geo in
      ZStack(alignment: .topLeading) {
        carPhoto(width: geo.size.width)
          .frame(width: geo.size.width, height: geo.size.height, alignment: .bottomTrailing)
        if fullColor {
          LinearGradient(
            stops: [
              .init(color: Palette.background, location: 0),
              .init(color: Palette.background, location: 0.33),
              .init(color: Palette.background.opacity(0.55), location: 0.55),
              .init(color: Palette.background.opacity(0), location: 0.8),
            ],
            startPoint: .leading, endPoint: .trailing
          )
        }
        info
          .padding(16)
          .frame(width: min(200, geo.size.width * 0.58), height: geo.size.height, alignment: .topLeading)
        lockPill
          .padding(12)
          .frame(width: geo.size.width, alignment: .topTrailing)
      }
    }
  }

  private func carPhoto(width: CGFloat) -> some View {
    let w = width * 0.775
    return car
      .resizable()
      .widgetAccentedRenderingMode(.desaturated)
      .aspectRatio(contentMode: .fill)
      .frame(width: w, height: w / 2)
      .clipped()
      .mask(LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: .black, location: 0.34)],
                           startPoint: .top, endPoint: .bottom))
      .opacity(fullColor ? 1 : 0.55)
      .offset(x: 10, y: 8)
      .accessibilityHidden(true)
  }

  private var info: some View {
    VStack(alignment: .leading, spacing: 0) {
      eyebrow
        .font(.system(size: 10, weight: .semibold))
        .tracking(1.4)
        .foregroundStyle(Palette.tertiary)
      Spacer(minLength: 4)
      HStack(alignment: .firstTextBaseline, spacing: 4) {
        Text(snapshot.rangeKm.map(String.init) ?? "—")
          .font(.system(size: 42, weight: .thin))
          .tracking(-1.6)
          .foregroundStyle(.white)
          .minimumScaleFactor(0.7)
          .lineLimit(1)
        Text("km")
          .font(.system(size: 13))
          .foregroundStyle(Palette.secondary)
      }
      fuelBar.padding(.top, 8)
      Spacer(minLength: 4)
      bottomLine
    }
  }

  private var fuelBar: some View {
    let pct = max(0, min(100, snapshot.fuelPct ?? 0))
    return HStack(spacing: 8) {
      ZStack(alignment: .leading) {
        Capsule().fill(Color.white.opacity(0.14))
        Capsule()
          .fill(snapshot.lowFuel ? Palette.warning : Palette.accent)
          .frame(width: 104 * pct / 100)
          .widgetAccentable()
      }
      .frame(width: 104, height: 3)
      Text(snapshot.fuelPct.map { "\(Int($0.rounded()))%" } ?? "—")
        .font(.system(size: 11, weight: .medium))
        .foregroundStyle(snapshot.lowFuel ? Palette.warning : Palette.secondary)
    }
  }

  @ViewBuilder private var bottomLine: some View {
    if let alert = snapshot.alert {
      HStack(spacing: 6) {
        Image(systemName: "exclamationmark.triangle")
          .font(.system(size: 11, weight: .semibold))
        Text(alert)
          .font(.system(size: 12, weight: .medium))
          .lineLimit(1)
          .minimumScaleFactor(0.8)
      }
      .foregroundStyle(Palette.warning)
      .widgetAccentable()
    } else {
      HStack(spacing: 6) {
        Image(systemName: "mappin")
          .font(.system(size: 11, weight: .medium))
          .foregroundStyle(Palette.secondary)
        Text(snapshot.place ?? "Posizione sconosciuta")
          .font(.system(size: 12, weight: .medium))
          .foregroundStyle(.white)
          .lineLimit(1)
          .minimumScaleFactor(0.85)
          .layoutPriority(1)
        if let time = timeLabel {
          Text("· \(time)")
            .font(.system(size: 12))
            .foregroundStyle(Palette.tertiary)
            .lineLimit(1)
            .fixedSize()
        }
      }
    }
  }

  @ViewBuilder private var lockPill: some View {
    if let locked = snapshot.locked {
      let color = locked ? Palette.accent : Palette.open
      HStack(spacing: 5) {
        Image(systemName: locked ? "lock.fill" : "lock.open.fill")
          .font(.system(size: 10, weight: .semibold))
        Text(locked ? "Chiusa" : "Aperta")
          .font(.system(size: 11, weight: .semibold))
      }
      .foregroundStyle(color)
      .padding(.leading, 8)
      .padding(.trailing, 10)
      .frame(height: 24)
      .background {
        if fullColor {
          Capsule().fill(Palette.background.opacity(0.55))
        }
      }
      .overlay(Capsule().strokeBorder(color.opacity(0.5), lineWidth: 1))
      .widgetAccentable()
    }
  }

  /// Con un avviso in basso, luogo e ora salgono qui al posto del nome;
  /// l'ora non si tronca mai, semmai il luogo.
  @ViewBuilder private var eyebrow: some View {
    if snapshot.alert != nil, snapshot.place != nil || timeLabel != nil {
      HStack(spacing: 0) {
        if let place = snapshot.place {
          Text(place.uppercased()).lineLimit(1)
        }
        if let time = timeLabel {
          Text(snapshot.place == nil ? time.uppercased() : " · \(time.uppercased())").lineLimit(1).fixedSize()
        }
      }
    } else {
      Text(snapshot.name.uppercased()).lineLimit(1)
    }
  }

  /// "14:32" oggi, "ieri 18:05", altrimenti "26 set".
  private var timeLabel: String? {
    guard let date = snapshot.updatedAt else { return nil }
    let calendar = Calendar.current
    let time = date.formatted(.dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits).locale(Locale(identifier: "it_IT")))
    if calendar.isDateInToday(date) { return time }
    if calendar.isDateInYesterday(date) { return "ieri \(time)" }
    return date.formatted(.dateTime.day().month(.abbreviated).locale(Locale(identifier: "it_IT")))
  }
}
