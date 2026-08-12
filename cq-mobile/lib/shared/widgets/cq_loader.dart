import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import 'brand_logo.dart';

/// The CQ branded loader — the logo above a row of dots that pulse in a wave.
///
/// Themed (the logo swaps for light/dark automatically) and safe on every device
/// (the dots animate by **scale**, never opacity-from-zero, which Vivo/BBK drop).
/// Show it wherever a real load happens — signing in now, data screens later —
/// via [LoadingOverlay]. This is the CQ answer to Naukri's launch loader.
class CqLoader extends StatefulWidget {
  const CqLoader({super.key, this.message, this.logoHeight = 46});

  final String? message;
  final double logoHeight;

  @override
  State<CqLoader> createState() => _CqLoaderState();
}

class _CqLoaderState extends State<CqLoader>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    )..repeat();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        BrandLogo(height: widget.logoHeight),
        const SizedBox(height: AppSpacing.xl),
        AnimatedBuilder(
          animation: _c,
          builder: (_, _) => Row(
            mainAxisSize: MainAxisSize.min,
            children: List.generate(5, (i) {
              // Each dot peaks a little after the one before → a travelling wave.
              final t = (_c.value - i * 0.16) % 1.0;
              final wave = (math.sin(t * 2 * math.pi) + 1) / 2; // 0..1
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: Transform.scale(
                  scale: 0.6 + 0.5 * wave,
                  child: Container(
                    width: 9,
                    height: 9,
                    decoration: BoxDecoration(
                      color: cq.accent,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
              );
            }),
          ),
        ),
        if (widget.message != null) ...[
          const SizedBox(height: AppSpacing.lg),
          Text(
            widget.message!,
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
