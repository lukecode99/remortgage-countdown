import SwiftUI
import WidgetKit

// Remortgage Countdown home-screen widget: day count to the end of the deal
// plus your rate vs the BoE benchmark average. Data is written by the app via
// ExtensionStorage (src/widget.ts) into the shared App Group UserDefaults —
// the shape mirrors WidgetPayload in src/widgetData.ts. The widget itself
// never touches the network. Live Activity was considered and deferred: a
// months-long countdown is a poor fit for an 8-hour activity budget, and it
// would have pulled ActivityKit + a push-token story into v1.

let appGroup = "group.com.lukeholder.remortgagecountdown"
let widgetKey = "widget_data"

// MARK: - Data

struct WidgetData: Decodable {
  let lender: String
  let dealEndDate: String // ISO yyyy-mm-dd
  let yourRatePct: Double
  let benchmarkPct: Double?
  let benchmarkAsOf: String?

  var dealEnd: Date? {
    let f = DateFormatter()
    f.dateFormat = "yyyy-MM-dd"
    f.timeZone = TimeZone(identifier: "UTC")
    return f.date(from: dealEndDate)
  }

  static func load() -> WidgetData? {
    guard let raw = UserDefaults(suiteName: appGroup)?.string(forKey: widgetKey),
          let json = raw.data(using: .utf8)
    else { return nil }
    return try? JSONDecoder().decode(WidgetData.self, from: json)
  }
}

struct Entry: TimelineEntry {
  let date: Date
  let data: WidgetData?

  var daysLeft: Int? {
    guard let end = data?.dealEnd else { return nil }
    let cal = Calendar.current
    return cal.dateComponents([.day], from: cal.startOfDay(for: date), to: cal.startOfDay(for: end)).day
  }
}

// MARK: - Provider

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> Entry {
    Entry(date: Date(), data: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
    completion(Entry(date: Date(), data: WidgetData.load()))
  }

  // One entry per midnight for the next fortnight so the day count ticks
  // over without the app running; the app also forces a reload on every
  // data change via ExtensionStorage.reloadWidget().
  func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
    let data = WidgetData.load()
    let cal = Calendar.current
    let start = cal.startOfDay(for: Date())
    var entries = [Entry(date: Date(), data: data)]
    for day in 1...14 {
      if let midnight = cal.date(byAdding: .day, value: day, to: start) {
        entries.append(Entry(date: midnight, data: data))
      }
    }
    completion(Timeline(entries: entries, policy: .atEnd))
  }
}

// MARK: - Views

struct CountdownView: View {
  @Environment(\.widgetFamily) var family
  let entry: Entry

  var body: some View {
    Group {
      if let data = entry.data, let days = entry.daysLeft {
        content(data: data, days: days)
      } else {
        emptyState
      }
    }
    .containerBackground(Color("widgetBg"), for: .widget)
    .widgetURL(URL(string: "remortgage://"))
  }

  var emptyState: some View {
    VStack(spacing: 4) {
      Text("Remortgage")
        .font(.headline)
        .foregroundStyle(Color("widgetText"))
      Text("Open the app and add your mortgage")
        .font(.caption)
        .foregroundStyle(Color("widgetTextDim"))
        .multilineTextAlignment(.center)
    }
  }

  func content(data: WidgetData, days: Int) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(data.lender)
        .font(.caption)
        .foregroundStyle(Color("widgetTextDim"))
        .lineLimit(1)

      if days > 0 {
        Text("\(days)")
          .font(.system(size: family == .systemSmall ? 34 : 40, weight: .heavy, design: .rounded))
          .foregroundStyle(days <= 90 ? Color("widgetAmber") : Color("widgetAccent"))
        Text(days == 1 ? "day left on your deal" : "days left on your deal")
          .font(.caption)
          .foregroundStyle(Color("widgetTextDim"))
      } else {
        Text("Deal ended")
          .font(.system(size: 22, weight: .heavy, design: .rounded))
          .foregroundStyle(Color("widgetAmber"))
        Text("likely on the revert rate")
          .font(.caption)
          .foregroundStyle(Color("widgetTextDim"))
      }

      Spacer(minLength: 2)
      rateLine(data: data)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
  }

  // Your rate vs the matched BoE average — labelled with its month, same
  // honesty rule as the in-app comparison.
  func rateLine(data: WidgetData) -> some View {
    Group {
      if let bench = data.benchmarkPct {
        if family == .systemSmall {
          Text("You \(pct(data.yourRatePct)) · avg \(pct(bench))")
        } else {
          Text("Your rate \(pct(data.yourRatePct)) · BoE avg \(pct(bench))\(data.benchmarkAsOf.map { " (\($0))" } ?? "")")
        }
      } else {
        Text("Your rate \(pct(data.yourRatePct))")
      }
    }
    .font(.caption2.weight(.semibold))
    .foregroundStyle(Color("widgetText"))
    .lineLimit(1)
  }

  func pct(_ v: Double) -> String {
    String(format: v == v.rounded() ? "%.0f%%" : "%.2f%%", v)
  }
}

// MARK: - Widget

struct CountdownWidget: Widget {
  let kind = "CountdownWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: Provider()) { entry in
      CountdownView(entry: entry)
    }
    .configurationDisplayName("Deal countdown")
    .description("Days until your deal ends, and your rate against the market.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

@main
struct CountdownWidgetBundle: WidgetBundle {
  var body: some Widget {
    CountdownWidget()
  }
}
