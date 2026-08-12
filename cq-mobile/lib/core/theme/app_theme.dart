import 'package:flutter/material.dart';

import 'app_colors.dart';
import 'app_spacing.dart';
import 'app_typography.dart';

/// The CQ Material 3 theme, tuned to the brand:
/// navy + cyan, Inter, generous touch targets, **borders over shadows**.
///
/// Every screen just uses `Theme.of(context)` / `context.cq` — no screen ever
/// hardcodes a hex value.
abstract final class CqTheme {
  static ThemeData get light => _build(Brightness.light, CqColors.light);
  static ThemeData get dark => _build(Brightness.dark, CqColors.dark);

  static ThemeData _build(Brightness brightness, CqColors cq) {
    final isLight = brightness == Brightness.light;

    // Start from a valid M3 scheme (fills every tonal slot), then override the
    // brand-critical colors so nothing is left to chance.
    final scheme =
        ColorScheme.fromSeed(
          seedColor: AppPalette.blue,
          brightness: brightness,
        ).copyWith(
          primary: AppPalette.blue,
          onPrimary: Colors.white,
          secondary: cq.accent,
          onSecondary: cq.onAccent,
          error: cq.danger,
          onError: Colors.white,
          surface: isLight ? AppPalette.lightSurface : AppPalette.darkSurface,
          onSurface: cq.fg,
          outline: cq.border,
          outlineVariant: cq.border,
        );

    final textTheme = AppTypography.textTheme(cq.fg, cq.fgMuted);
    final scaffoldBg = isLight ? AppPalette.lightBg : AppPalette.darkBg;

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: scaffoldBg,
      textTheme: textTheme,
      splashFactory: InkSparkle.splashFactory,
      extensions: <ThemeExtension<dynamic>>[cq],

      appBarTheme: AppBarTheme(
        backgroundColor: scaffoldBg,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0.5,
        shadowColor: cq.border,
        centerTitle: false,
        foregroundColor: cq.fg,
        titleTextStyle: textTheme.titleLarge,
      ),

      // Primary CTA — solid CQ blue, tall touch target, 12px radius.
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppPalette.blue,
          foregroundColor: Colors.white,
          disabledBackgroundColor: AppPalette.blue.withValues(alpha: 0.4),
          disabledForegroundColor: Colors.white70,
          minimumSize: const Size.fromHeight(52),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.md),
          ),
          textStyle: textTheme.labelLarge,
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl),
        ),
      ),

      // Secondary — outlined, hairline border, neutral ink.
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: cq.fg,
          minimumSize: const Size.fromHeight(52),
          side: BorderSide(color: cq.border),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.md),
          ),
          textStyle: textTheme.labelLarge,
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl),
        ),
      ),

      // Tertiary — text button in the accent color.
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppPalette.blue,
          textStyle: textTheme.labelLarge,
        ),
      ),

      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: cq.surfaceMuted,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.lg,
          vertical: AppSpacing.lg - 2,
        ),
        hintStyle: textTheme.bodyMedium?.copyWith(color: cq.fgSubtle),
        prefixIconColor: cq.fgMuted,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
          borderSide: BorderSide(color: cq.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
          borderSide: BorderSide(color: cq.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
          borderSide: const BorderSide(color: AppPalette.blue, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
          borderSide: BorderSide(color: cq.danger),
        ),
      ),

      dividerTheme: DividerThemeData(
        color: cq.border,
        thickness: 1,
        space: 1,
      ),

      chipTheme: ChipThemeData(
        backgroundColor: cq.surfaceMuted,
        side: BorderSide(color: cq.border),
        labelStyle: textTheme.labelMedium,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.pill),
        ),
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.sm,
        ),
      ),

      // Bottom tab bar — branded: labels always visible, cyan selected state,
      // a soft cyan indicator pill, flat (we add a hairline top border in the
      // shell instead of a shadow).
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: scaffoldBg,
        surfaceTintColor: Colors.transparent,
        indicatorColor: cq.accent.withValues(alpha: 0.16),
        elevation: 0,
        height: 66,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        iconTheme: WidgetStateProperty.resolveWith(
          (s) => IconThemeData(
            size: 24,
            color: s.contains(WidgetState.selected) ? cq.accent : cq.fgMuted,
          ),
        ),
        labelTextStyle: WidgetStateProperty.resolveWith(
          (s) => textTheme.labelSmall!.copyWith(
            color: s.contains(WidgetState.selected) ? cq.accent : cq.fgMuted,
            fontWeight: s.contains(WidgetState.selected)
                ? FontWeight.w700
                : FontWeight.w500,
          ),
        ),
      ),
    );
  }
}
