// Display formatters for job data — ported from the website's
// apps/web/lib/job/format.ts so on-device output matches live data exactly.
//
// The API returns RAW values (salary in paise, experience in months/years,
// dates as ISO). Formatting stays on the client so copy/locale tweaks never
// need a backend deploy.

String _trimNum(double v) =>
    v % 1 == 0 ? v.toInt().toString() : v.toStringAsFixed(1);

/// paise → "₹N–M LPA" (or "₹N.N Cr" past a crore). Null when both are null.
String? formatSalaryLpa(int? minPaise, int? maxPaise) {
  if (minPaise == null && maxPaise == null) return null;
  String toLpa(int p) {
    final lakhs = p / 100 / 100000;
    if (lakhs >= 100) return '${_trimNum(lakhs / 100)} Cr';
    return _trimNum(lakhs);
  }

  if (minPaise != null && maxPaise != null) {
    return '₹${toLpa(minPaise)}–${toLpa(maxPaise)} LPA';
  }
  if (minPaise != null) return '₹${toLpa(minPaise)}+ LPA';
  return 'Up to ₹${toLpa(maxPaise!)} LPA';
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
String postedAgo(DateTime posted) {
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
