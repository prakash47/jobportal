import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';

/// The app's primary call-to-action.
///
/// Cyan (brand accent) fill with **navy ink** — the exact logo colours. This
/// pairing is deliberate: cyan + white text fails contrast (≈2.8:1), but cyan +
/// navy passes AA (≈5.4:1) and reads identically in light *and* dark. Optional
/// leading [icon] and a trailing arrow for "this moves you forward".
class CqPrimaryButton extends StatelessWidget {
  const CqPrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.showArrow = false,
    this.loading = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool showArrow;

  /// When true the button shows a spinner and ignores taps.
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    return SizedBox(
      height: 54,
      width: double.infinity,
      child: Material(
        color: cq.accent,
        borderRadius: BorderRadius.circular(AppRadius.md),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: loading ? null : onPressed,
          child: loading
              ? Center(
                  child: SizedBox(
                    height: 22,
                    width: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      valueColor: AlwaysStoppedAnimation<Color>(cq.onAccent),
                    ),
                  ),
                )
              : Stack(
            alignment: Alignment.center,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (icon != null) ...[
                    Icon(icon, size: 20, color: cq.onAccent),
                    const SizedBox(width: AppSpacing.md),
                  ],
                  Text(
                    label,
                    style: TextStyle(
                      color: cq.onAccent,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
              if (showArrow)
                Positioned(
                  right: AppSpacing.lg,
                  child: Icon(
                    Icons.arrow_forward_rounded,
                    size: 20,
                    color: cq.onAccent,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A full-width outlined "Continue with …" button carrying a provider [icon].
/// Hairline border, neutral ink — reads correctly in light and dark.
class CqProviderButton extends StatelessWidget {
  const CqProviderButton({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final Widget icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    return SizedBox(
      height: 54,
      width: double.infinity,
      child: OutlinedButton(
        onPressed: onTap,
        style: OutlinedButton.styleFrom(
          foregroundColor: cq.fg,
          side: BorderSide(color: cq.border),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.md),
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            icon,
            const SizedBox(width: AppSpacing.md),
            Text(label),
          ],
        ),
      ),
    );
  }
}
