import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import 'cq_buttons.dart';

/// The shared furniture every list screen needs: a failure state and a pager.
///
/// **Why this file exists.** `_ErrorView` was copy-pasted as a private class into
/// 13 screens — 12 byte-identical, and the 13th had already drifted to a
/// different button. `_Pager` was duplicated 5 times, differing only in the TYPE
/// of the page object it read `page` and `totalPages` from. Duplication that
/// large stops being harmless the moment one copy changes, which had already
/// happened: the same failure looked like two different products depending on
/// which screen you were standing on.

/// What a screen shows when its data could not be loaded.
///
/// The retry is an [OutlinedButton] by default — a failure inside a tab is
/// recoverable and should not shout. Pass [blocking] on a screen where the
/// error is the ONLY thing there and nothing can proceed without a retry (the
/// onboarding wizard), and the retry becomes the primary action instead. That
/// distinction is why the onboarding copy had drifted, so it is kept rather
/// than flattened away.
class CqErrorView extends StatelessWidget {
  const CqErrorView({
    super.key,
    required this.message,
    required this.onRetry,
    this.blocking = false,
  });

  final String message;
  final VoidCallback onRetry;
  final bool blocking;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl2),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_off_rounded, size: 40, color: context.cq.fgSubtle),
            const SizedBox(height: AppSpacing.lg),
            Text(message, textAlign: TextAlign.center, style: text.bodyLarge),
            SizedBox(height: blocking ? AppSpacing.xl : AppSpacing.lg),
            if (blocking)
              CqPrimaryButton(label: 'Try again', onPressed: onRetry)
            else
              OutlinedButton(onPressed: onRetry, child: const Text('Try again')),
          ],
        ),
      ),
    );
  }
}

/// "Page N of M" with a chevron either side. Renders nothing on a single page.
///
/// Takes plain integers rather than a page object: the five copies this
/// replaces were identical apart from the type they read those two numbers
/// from, which is not a difference worth a generic.
class CqPager extends StatelessWidget {
  const CqPager({
    super.key,
    required this.page,
    required this.totalPages,
    required this.onGo,
  });

  final int page;
  final int totalPages;
  final void Function(int page) onGo;

  @override
  Widget build(BuildContext context) {
    if (totalPages <= 1) return const SizedBox.shrink();
    final cq = context.cq;
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.sm),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          IconButton(
            tooltip: 'Previous page',
            onPressed: page > 1 ? () => onGo(page - 1) : null,
            icon: const Icon(Icons.chevron_left_rounded),
          ),
          Text(
            'Page $page of $totalPages',
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: cq.fgMuted),
          ),
          IconButton(
            tooltip: 'Next page',
            onPressed: page < totalPages ? () => onGo(page + 1) : null,
            icon: const Icon(Icons.chevron_right_rounded),
          ),
        ],
      ),
    );
  }
}
