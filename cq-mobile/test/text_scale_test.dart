import 'package:cq_mobile/core/theme/app_theme.dart';
import 'package:cq_mobile/features/jobs/data/job_models.dart';
import 'package:cq_mobile/shared/widgets/cq_buttons.dart';
import 'package:cq_mobile/shared/widgets/cq_chips.dart';
import 'package:cq_mobile/shared/widgets/cq_loader.dart';
import 'package:cq_mobile/shared/widgets/cq_states.dart';
import 'package:cq_mobile/shared/widgets/job_row_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Large-text pass.
///
/// Both stores expect a layout that survives the OS font-size setting, and
/// Android's slider reaches 2.0x while Apple's accessibility sizes go further
/// still. An overflow here is not cosmetic: a RenderFlex that overflows clips
/// the text, so a salary or a job title simply stops being readable for the
/// users who most need it larger.
///
/// A phone-narrow viewport is used deliberately — most overflows only appear
/// when the width is small and the text is big at the same time.
const _phone = Size(360, 780);

Future<void> _pumpAt(
  WidgetTester tester,
  double scale,
  Widget child,
) async {
  tester.view.physicalSize = _phone;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MediaQuery(
      data: MediaQueryData(
        size: _phone,
        textScaler: TextScaler.linear(scale),
      ),
      child: MaterialApp(
        theme: CqTheme.light,
        home: Scaffold(
          body: SingleChildScrollView(
            child: Padding(padding: const EdgeInsets.all(16), child: child),
          ),
        ),
      ),
    ),
  );
}

JobSummary _job({
  String title = 'Senior Flutter Engineer, Platform & Infrastructure',
  String company = 'Acme Technology Solutions Private Limited',
}) =>
    JobSummary.fromJson({
      'id': 1,
      'title': title,
      'canonicalSlug': 'senior-flutter-engineer-acme-1',
      'company': {'id': 1, 'name': company, 'slug': 'acme'},
      'postedAt': '2026-08-01T00:00:00.000Z',
      'city': 'Bengaluru',
      'salaryMin': 180000000,
      'salaryMax': 320000000,
      'skills': ['Dart', 'Flutter', 'Kotlin'],
    });

/// Renders [child] at each scale and fails on the first overflow.
void _survives(String name, Widget Function() build) {
  for (final scale in const [1.0, 1.3, 2.0]) {
    testWidgets('$name survives ${scale}x text', (tester) async {
      await _pumpAt(tester, scale, build());
      expect(
        tester.takeException(),
        isNull,
        reason: '$name overflowed at ${scale}x — text would be clipped',
      );
    });
  }
}

void main() {
  _survives('job row card', () => JobRowCard(job: _job(), onTap: () {}));

  _survives(
    'job row card with a long single word',
    // A title with no break opportunity is the worst case for any Row.
    () => JobRowCard(
      job: _job(title: 'Chief-Technology-Officer-and-Head-of-Engineering'),
      onTap: () {},
    ),
  );

  _survives(
    'filter chip row',
    () => Wrap(
      children: [
        for (final l in const ['Bengaluru', 'Remote', 'Full-time', '5+ years'])
          CqChip(label: l, onTap: () {}, selected: l == 'Remote'),
      ],
    ),
  );

  _survives(
    'skill tags',
    () => const Wrap(
      children: [CqTag('Dart'), CqTag('Flutter'), CqTag('Infrastructure')],
    ),
  );

  _survives(
    'error view',
    () => CqErrorView(
      message: 'We could not reach the server. Check your connection and try '
          'again in a moment.',
      onRetry: () {},
    ),
  );

  _survives('pager', () => CqPager(page: 7, totalPages: 12, onGo: (_) {}));

  _survives(
    'provider button',
    () => CqProviderButton(
      icon: const Icon(Icons.g_mobiledata_rounded),
      label: 'Continue with Google',
      onTap: () {},
    ),
  );

  _survives('loader with a message', () => const CqLoader(message: 'Loading your saved jobs…'));

  _survives(
    'blocking error view',
    () => CqErrorView(
      message: 'We could not load your profile.',
      onRetry: () {},
      blocking: true,
    ),
  );

  _survives(
    'primary button while loading',
    () => const CqPrimaryButton(label: 'Apply now', onPressed: null, loading: true),
  );

  _survives(
    'primary button with a long label',
    () => CqPrimaryButton(
      label: 'Apply with your saved resume',
      icon: Icons.send_rounded,
      onPressed: () {},
    ),
  );
}
