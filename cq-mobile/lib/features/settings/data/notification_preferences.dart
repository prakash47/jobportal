/// The signed-in user's email-notification toggles, from `GET /me/notifications`
/// (SRS §4.13.4). Account emails — verification, password reset, receipts — are
/// always sent and are intentionally not represented here.
///
/// Field names map to the API's `*Enabled` keys via [fromJson] / [toJson].
class NotificationPreferences {
  const NotificationPreferences({
    required this.jobAlerts,
    required this.applicationUpdates,
    required this.productNews,
  });

  final bool jobAlerts;
  final bool applicationUpdates;
  final bool productNews;

  /// Server defaults (mirrors the backend): alerts + application updates on,
  /// product news off. Used as a safe fallback if a key is ever missing.
  factory NotificationPreferences.fromJson(Map<String, dynamic> j) {
    return NotificationPreferences(
      jobAlerts: j['jobAlertsEnabled'] as bool? ?? true,
      applicationUpdates: j['applicationStatusEnabled'] as bool? ?? true,
      productNews: j['productNewsEnabled'] as bool? ?? false,
    );
  }

  /// The PATCH body `/me/notifications` expects. The endpoint is `.strict()`,
  /// so only these three keys may be sent.
  Map<String, dynamic> toJson() => {
        'jobAlertsEnabled': jobAlerts,
        'applicationStatusEnabled': applicationUpdates,
        'productNewsEnabled': productNews,
      };

  NotificationPreferences copyWith({
    bool? jobAlerts,
    bool? applicationUpdates,
    bool? productNews,
  }) {
    return NotificationPreferences(
      jobAlerts: jobAlerts ?? this.jobAlerts,
      applicationUpdates: applicationUpdates ?? this.applicationUpdates,
      productNews: productNews ?? this.productNews,
    );
  }

  @override
  bool operator ==(Object other) =>
      other is NotificationPreferences &&
      other.jobAlerts == jobAlerts &&
      other.applicationUpdates == applicationUpdates &&
      other.productNews == productNews;

  @override
  int get hashCode => Object.hash(jobAlerts, applicationUpdates, productNews);
}
