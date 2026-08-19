import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import 'cq_brand_loader.dart';

/// The app's standard loading state: the CQ mark with the arrow advancing into
/// it, optionally over a line of text.
///
/// The animation is [CqBrandLoader] — the website's own loader, ported number
/// for number, so a wait feels like the same product on both surfaces. It
/// replaced a logo-plus-pulsing-dots spinner, which read as generic.
class CqLoader extends StatelessWidget {
  const CqLoader({super.key, this.message, this.logoHeight = 52});

  final String? message;

  /// Height of the mark. Width follows the 400:178 aspect of the logo.
  final double logoHeight;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        CqBrandLoader(
          width: logoHeight * 400 / 178,
          semanticLabel: message ?? 'Loading',
        ),
        if (message != null) ...[
          const SizedBox(height: AppSpacing.lg),
          Text(
            message!,
            textAlign: TextAlign.center,
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: cq.fgMuted),
          ),
        ],
      ],
    );
  }
}

/// Stacks the [CqLoader] over [child] behind a soft brand scrim while [loading]
/// — the standard way to show a "please wait" for a network call.
class LoadingOverlay extends StatelessWidget {
  const LoadingOverlay({
    super.key,
    required this.loading,
    required this.child,
    this.message,
  });

  final bool loading;
  final Widget child;
  final String? message;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        child,
        if (loading)
          Positioned.fill(
            child: ColoredBox(
              color: Theme.of(
                context,
              ).scaffoldBackgroundColor.withValues(alpha: 0.86),
              child: Center(child: CqLoader(message: message)),
            ),
          ),
      ],
    );
  }
}
