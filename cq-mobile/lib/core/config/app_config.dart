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

  /// Public website base URL — used to build the shareable canonical job link
  /// (`<webBaseUrl>/job/<slug>`), which is a *website* URL, not an API one.
  ///
  /// The website has no production domain yet (the API's own `WEB_URL` still
  /// defaults to localhost), so a shared link is only useful once it is
  /// deployed. Point this at the real domain then:
  ///     flutter run --dart-define=WEB_BASE_URL=https://careerqueue.in
  static const String webBaseUrl = String.fromEnvironment(
    'WEB_BASE_URL',
    defaultValue: 'http://localhost:3000',
  );

  /// True when a build would ship pointing at a developer's machine.
  ///
  /// Both base URLs default to localhost, which is right for development and
  /// catastrophic in a store build: the app reaches nothing, and every job link
  /// it shares points at the reviewer's own device. Nothing in the pipeline
  /// noticed — a release APK built with no --dart-define looked perfectly
  /// normal until it was installed.
  static bool get pointsAtLocalhost =>
      _isLocal(apiBaseUrl) || _isLocal(webBaseUrl);

  static bool _isLocal(String url) =>
      url.contains('localhost') ||
      url.contains('127.0.0.1') ||
      url.contains('10.0.2.2') ||
      url.startsWith('http://');

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

  /// Whether the alternative sign-in entry points — Google and phone/OTP — are
  /// offered anywhere in the app.
  ///
  /// OFF by default, because none of them completes a sign-in yet: Google needs
  /// an OAuth client id (which needs the release keystore's SHA-1 first), and
  /// phone/OTP needs backend endpoints that do not exist. Shipping them visible
  /// is an App Store guideline 2.1 rejection on sight, and the phone one is the
  /// worse of the two — it opens a real screen and collects a validated number
  /// before dead-ending.
  ///
  /// The screens themselves are deliberately left in the tree rather than
  /// deleted; flipping this const brings them all back at once. Enable with
  /// `--dart-define=AUTH_ALTERNATIVES=true`.
  static const bool showAuthAlternatives =
      bool.fromEnvironment('AUTH_ALTERNATIVES', defaultValue: false);
}
