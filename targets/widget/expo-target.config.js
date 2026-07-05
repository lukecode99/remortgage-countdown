/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: 'widget',
  name: 'CountdownWidget',
  displayName: 'Remortgage Countdown',
  // Appended to the main app bundle id → com.lukeholder.remortgagecountdown.widget
  bundleIdentifier: '.widget',
  deploymentTarget: '17.0',
  appleTeamId: 'V628699P6F',
  frameworks: ['SwiftUI', 'WidgetKit'],
  // The widget reads its data from the shared App Group UserDefaults, written
  // by the app via ExtensionStorage (src/widget.ts). Must match app.json's
  // ios.entitlements application-groups.
  entitlements: {
    'com.apple.security.application-groups': ['group.com.lukeholder.remortgagecountdown'],
  },
  // Mirrors src/theme.ts so the widget matches the app.
  colors: {
    widgetBg: '#0E1220',
    widgetText: '#F2F5FA',
    widgetTextDim: '#8D9AB5',
    widgetAccent: '#5EA0FF',
    widgetAmber: '#F5B841',
  },
};
