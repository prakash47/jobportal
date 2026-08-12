import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';

/// The Career Queue logo.
///
/// Shows the **colour** logo on light backgrounds and the **white** logo on
/// dark ones. If the image asset isn't available yet (e.g. before a full
/// restart bundles it), it falls back to a coded brand mark so the UI is
/// **never blank**.
class BrandLogo extends StatelessWidget {
  const BrandLogo({super.key, this.height = 56});

  final double height;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Image.asset(
      isDark ? 'assets/images/cq_logo_white.png' : 'assets/images/cq_logo.png',
      height: height,
      fit: BoxFit.contain,
      errorBuilder: (context, error, stack) => _FallbackMark(height: height),
    );
  }
}

/// Coded "CQ · Career Queue" lockup — the safety net when the image can't load.
class _FallbackMark extends StatelessWidget {
  const _FallbackMark({required this.height});

  final double height;

  @override
  Widget build(BuildContext context) {
    final box = height * 0.66;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: box,
          height: box,
          decoration: BoxDecoration(
            color: context.cq.brandNavy,
            borderRadius: BorderRadius.circular(AppRadius.sm),
          ),
          alignment: Alignment.center,
          child: Padding(
            padding: const EdgeInsets.all(4),
            child: FittedBox(
              child: const Text(
                'CQ',
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.5,
                ),
              ),
            ),
          ),
        ),
        SizedBox(width: height * 0.16),
        Text(
          'Career Queue',
          style: TextStyle(
            fontSize: height * 0.32,
            fontWeight: FontWeight.w700,
            color: context.cq.fg,
          ),
        ),
      ],
    );
  }
}
