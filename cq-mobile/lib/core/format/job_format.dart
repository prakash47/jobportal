// Display formatters for job data — ported from the website's
// apps/web/lib/job/format.ts so on-device output matches live data exactly.
//
// The API returns RAW values (salary in paise, experience in months/years,
// dates as ISO). Formatting stays on the client so copy/locale tweaks never
// need a backend deploy.

String _trimNum(double v) =>
    v % 1 == 0 ? v.toInt().toString() : v.toStringAsFixed(1);

/// Lakhs per annum in one crore.
const double _lakhsPerCrore = 100;

/// paise → "₹N–M LPA" (or "₹N.N Cr" past a crore). Null when both are null.
///
/// Two rules exist because the naive version produced nonsense on real data:
///
///  * **Collapse an identical range.** Both ends are rounded to one decimal
///    BEFORE they are compared. A max only a rounding step above the min used
///    to render as `₹32–32.0 LPA` — a range whose two ends read the same
///    number. (Live example: 320000000 / 320305827 paise.)
///  * **Match the precision of the two ends.** `₹19–19.4 LPA` showed a decimal
///    on one side and hid it on the other, which reads like a formatting slip.
///    Either both sides are whole, or both carry one decimal.
String? formatSalaryLpa(int? minPaise, int? maxPaise) {
  if (minPaise == null && maxPaise == null) return null;

  double lakhs(int paise) => paise / 100 / 100000;
  bool isCrore(double l) => l >= _lakhsPerCrore;
  double display(double l) => isCrore(l) ? l / 100 : l;
  String unit(double l) => isCrore(l) ? 'Cr' : 'LPA';
  double round1(double v) => (v * 10).round() / 10;
  String fmt(double v, {required bool oneDecimal}) =>
      oneDecimal ? v.toStringAsFixed(1) : v.toInt().toString();

  if (minPaise != null && maxPaise != null) {
    final lo = lakhs(minPaise);
    final hi = lakhs(maxPaise);

    // A range that straddles a crore cannot share one unit, so each end keeps
    // its own rather than silently rendering 90 lakhs and 1.2 crore as "90–1.2".
    if (isCrore(lo) != isCrore(hi)) {
      final loR = round1(display(lo));
      final hiR = round1(display(hi));
      return '₹${_trimNum(loR)} ${unit(lo)}–₹${_trimNum(hiR)} ${unit(hi)}';
    }

    final loR = round1(display(lo));
    final hiR = round1(display(hi));
    if (loR == hiR) return '₹${_trimNum(loR)} ${unit(lo)}';

    final oneDecimal = loR % 1 != 0 || hiR % 1 != 0;
    return '₹${fmt(loR, oneDecimal: oneDecimal)}'
        '–${fmt(hiR, oneDecimal: oneDecimal)} ${unit(hi)}';
  }

  if (minPaise != null) {
    final lo = lakhs(minPaise);
    return '₹${_trimNum(round1(display(lo)))}+ ${unit(lo)}';
  }
  final hi = lakhs(maxPaise!);
  return 'Up to ₹${_trimNum(round1(display(hi)))} ${unit(hi)}';
}

/// Prisma-side experience (years) → "N–M yrs".
String? formatExperienceYears(int? min, int? max) {
  if (min == null && max == null) return null;
  if (min != null && max != null) return '$min–$max yrs';
  if (min != null) return '$min+ yrs';
  return 'Up to $max yrs';
}

/// ES-side experience (months) → "N–M yrs" (rounded to whole years).
String? formatExperienceMonths(int? minMonths, int? maxMonths) {
  int toY(int m) => (m / 12).round();
  if (minMonths == null && maxMonths == null) return null;
  if (minMonths != null && maxMonths != null) {
    return '${toY(minMonths)}–${toY(maxMonths)} yrs';
  }
  if (minMonths != null) return '${toY(minMonths)}+ yrs';
  return 'Up to ${toY(maxMonths!)} yrs';
}

/// Compact relative "posted" age: today, 3d ago, 2w ago, 1mo ago, 1y ago.
///
/// Null in, null out — and every caller drops the line rather than printing a
/// placeholder. The parsers used to substitute DateTime.now() for a timestamp
/// the server had not sent, which rendered as "today": a six-month-old listing
/// presented as fresh. On a job board recency is a decision input, so inventing
/// it is worse than admitting the gap.
String? postedAgo(DateTime? posted) {
  if (posted == null) return null;
  final days = DateTime.now().difference(posted).inDays;
  if (days <= 0) return 'today';
  if (days == 1) return '1d ago';
  if (days < 7) return '${days}d ago';
  if (days < 30) return '${days ~/ 7}w ago';
  if (days < 365) return '${days ~/ 30}mo ago';
  return '${days ~/ 365}y ago';
}

const employmentLabels = <String, String>{
  'FULL_TIME': 'Full-time',
  'PART_TIME': 'Part-time',
  'CONTRACTOR': 'Contract',
  'INTERN': 'Internship',
};

const workModeLabels = <String, String>{
  'ONSITE': 'On-site',
  'REMOTE': 'Remote',
  'HYBRID': 'Hybrid',
};

String employmentLabel(String? v) => employmentLabels[v] ?? (v ?? '');
String workModeLabel(String? v) => workModeLabels[v] ?? (v ?? '');

const _monthsShort = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/// "5 Aug 2026"
String formatDate(DateTime d) => '${d.day} ${_monthsShort[d.month - 1]} ${d.year}';

/// "Aug 2026"
String formatMonthYear(DateTime d) => '${_monthsShort[d.month - 1]} ${d.year}';

/// Compact large counts: 840 → "840", 2840 → "2.8k", 120000 → "1.2L".
String compactCount(int n) {
  if (n < 1000) return '$n';
  if (n < 100000) {
    final k = n / 1000;
    return '${k % 1 == 0 ? k.toInt() : k.toStringAsFixed(1)}k';
  }
  final l = n / 100000;
  return '${l % 1 == 0 ? l.toInt() : l.toStringAsFixed(1)}L';
}
