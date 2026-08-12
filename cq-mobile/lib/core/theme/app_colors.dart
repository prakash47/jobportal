import 'package:flutter/material.dart';

/// Raw CQ brand + neutral colors.
///
/// Prefer reading *semantic* tokens from [CqColors] via `context.cq` inside
/// widgets — that way light/dark switch automatically. Only reach for
/// [AppPalette] directly when you need a fixed brand hue (e.g. the logo mark).
abstract final class AppPalette {
  // ── Brand ────────────────────────────────────────────────────────────────
  /// Primary action color (CQ blue). AA-safe with white text.
  static const Color blue = Color(0xFF2563EB);

  /// Deep brand navy — headers, the CQ mark, dark brand surfaces.
  /// Exact value from the official logo SVG.
  static const Color navy = Color(0xFF192349);

  /// Logo-arrow accent cyan — links, selected states, highlights.
  /// Exact value from the official logo SVG.
  static const Color cyan = Color(0xFF24A0DB);

  // ── Semantic ─────────────────────────────────────────────────────────────
  static const Color success = Color(0xFF15A34A);
  static const Color danger = Color(0xFFDC2626);
  static const Color warning = Color(0xFFD97706);

  // ── Light neutrals ───────────────────────────────────────────────────────
  static const Color lightBg = Color(0xFFFFFFFF);
  static const Color lightSurface = Color(0xFFFFFFFF);
  static const Color lightSurfaceMuted = Color(0xFFF5F7FA);
  static const Color lightBorder = Color(0xFFE4E8EF);
  static const Color lightFg = Color(0xFF0F1729);
  static const Color lightFgMuted = Color(0xFF5B667A);
  static const Color lightFgSubtle = Color(0xFF97A1B0);

  // ── Dark neutrals ────────────────────────────────────────────────────────
  static const Color darkBg = Color(0xFF0B1020);
  static const Color darkSurface = Color(0xFF121829);
  static const Color darkSurfaceMuted = Color(0xFF1A2236);
  static const Color darkBorder = Color(0xFF262F45);
  static const Color darkFg = Color(0xFFE8ECF4);
  static const Color darkFgMuted = Color(0xFF9AA5BC);
  static const Color darkFgSubtle = Color(0xFF6B7793);
}

/// Semantic CQ design tokens that Material's [ColorScheme] doesn't cover
/// (muted surfaces, hairline borders, the 3-tier text ramp, brand accents).
///
/// Registered as a [ThemeExtension] so every widget can read the *right* value
/// for the current brightness via `context.cq`.
@immutable
class CqColors extends ThemeExtension<CqColors> {
  const CqColors({
    required this.brandNavy,
    required this.accent,
    required this.onAccent,
    required this.success,
    required this.warning,
    required this.danger,
    required this.surfaceMuted,
    required this.border,
    required this.fg,
    required this.fgMuted,
    required this.fgSubtle,
  });

  /// Deep brand navy (constant across light/dark).
  final Color brandNavy;

  /// Cyan accent + the ink that sits legibly on top of it.
  final Color accent;
  final Color onAccent;

  final Color success;
  final Color warning;
  final Color danger;

  /// Subtle fills — chips, section backgrounds, input fields.
  final Color surfaceMuted;

  /// Hairline separators (we favor borders over shadows).
  final Color border;

  /// Text ramp: primary → secondary → tertiary/hint.
  final Color fg;
  final Color fgMuted;
  final Color fgSubtle;

  static const CqColors light = CqColors(
    brandNavy: AppPalette.navy,
    accent: AppPalette.cyan,
    onAccent: AppPalette.navy,
    success: AppPalette.success,
    warning: AppPalette.warning,
    danger: AppPalette.danger,
    surfaceMuted: AppPalette.lightSurfaceMuted,
    border: AppPalette.lightBorder,
    fg: AppPalette.lightFg,
    fgMuted: AppPalette.lightFgMuted,
    fgSubtle: AppPalette.lightFgSubtle,
  );

  static const CqColors dark = CqColors(
    brandNavy: AppPalette.navy,
    accent: AppPalette.cyan,
    onAccent: AppPalette.navy,
    success: AppPalette.success,
    warning: AppPalette.warning,
    danger: AppPalette.danger,
    surfaceMuted: AppPalette.darkSurfaceMuted,
    border: AppPalette.darkBorder,
    fg: AppPalette.darkFg,
    fgMuted: AppPalette.darkFgMuted,
    fgSubtle: AppPalette.darkFgSubtle,
  );

  @override
  CqColors copyWith({
    Color? brandNavy,
    Color? accent,
    Color? onAccent,
    Color? success,
    Color? warning,
    Color? danger,
    Color? surfaceMuted,
    Color? border,
    Color? fg,
    Color? fgMuted,
    Color? fgSubtle,
  }) {
    return CqColors(
      brandNavy: brandNavy ?? this.brandNavy,
      accent: accent ?? this.accent,
      onAccent: onAccent ?? this.onAccent,
      success: success ?? this.success,
      warning: warning ?? this.warning,
      danger: danger ?? this.danger,
      surfaceMuted: surfaceMuted ?? this.surfaceMuted,
      border: border ?? this.border,
      fg: fg ?? this.fg,
      fgMuted: fgMuted ?? this.fgMuted,
      fgSubtle: fgSubtle ?? this.fgSubtle,
    );
  }

  @override
  CqColors lerp(ThemeExtension<CqColors>? other, double t) {
    if (other is! CqColors) return this;
    return CqColors(
      brandNavy: Color.lerp(brandNavy, other.brandNavy, t)!,
      accent: Color.lerp(accent, other.accent, t)!,
      onAccent: Color.lerp(onAccent, other.onAccent, t)!,
      success: Color.lerp(success, other.success, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      danger: Color.lerp(danger, other.danger, t)!,
      surfaceMuted: Color.lerp(surfaceMuted, other.surfaceMuted, t)!,
      border: Color.lerp(border, other.border, t)!,
      fg: Color.lerp(fg, other.fg, t)!,
      fgMuted: Color.lerp(fgMuted, other.fgMuted, t)!,
      fgSubtle: Color.lerp(fgSubtle, other.fgSubtle, t)!,
    );
  }
}

/// Ergonomic access: `context.cq.fgMuted`, `context.cq.border`, …
extension CqColorsX on BuildContext {
  CqColors get cq => Theme.of(this).extension<CqColors>()!;
}
