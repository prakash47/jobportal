/// App-wide configuration. Anything that changes per environment lives here,
/// so there's exactly one place to look.
abstract final class AppConfig {
  /// Base URL of the Career Queue API.
  ///
  /// Default `127.0.0.1:4000` (NOT `localhost`) works when you run:
  ///     adb reverse tcp:4000 tcp:4000
  /// so a USB-connected phone tunnels to your PC's API over the cable
  /// (no Wi-Fi or IP address needed).
  ///
  /// **Why `127.0.0.1` and not `localhost`:** on Android, `localhost` can
  /// resolve to the IPv6 loopback `::1`, but `adb reverse` only listens on the
  /// IPv4 loopback — so `localhost` intermittently fails with "Connection
  /// failed" while `127.0.0.1` is unambiguous IPv4 and always matches the tunnel.
  ///
  /// Alternatives:
  ///   • Real phone over Wi-Fi → your PC's LAN IP, e.g. http://192.168.1.7:4000
  ///   • Android emulator      → http://10.0.2.2:4000
  ///
  /// Override at launch without editing code:
  ///     flutter run --dart-define=API_BASE_URL=http://192.168.1.7:4000
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://127.0.0.1:4000',
  );

  /// Fail fast if the server can't be reached / is slow.
  static const Duration connectTimeout = Duration(seconds: 15);
  static const Duration receiveTimeout = Duration(seconds: 20);

  /// While the backend's public browse endpoints (jobs, companies, home,
  /// career advice) are still being built, those screens run on **static
  /// sample data**. Flip to `false` (or pass
  /// `--dart-define=USE_MOCK_DATA=false`) once the website dev ships an
  /// endpoint — the repositories already hold the live Dio calls, so only the
  /// data source changes, never the UI.
  /// Offline demo / presentation mode: sample data everywhere + a one-tap demo
  /// login, so the app runs with no server. Enable with
  /// `--dart-define=DEMO_MODE=true`.
  static const bool demoMode = bool.fromEnvironment(
    'DEMO_MODE',
    defaultValue: false,
  );

  /// Browse features — and, in [demoMode], every screen — use static sample data
  /// when true. Forced on by [demoMode]: an offline demo can't reach the API.
  static const bool useMockData =
      demoMode || bool.fromEnvironment('USE_MOCK_DATA', defaultValue: false);
}
