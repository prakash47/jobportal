import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Inter type system for CQ.
///
/// One typeface, hierarchy via **weight + size** (not color) — matching the web
/// brand. Sizes track the web scale: 12 / 14 / 16 / 18 / 20 / 24 / 30.
///
/// > Production note: we currently fetch Inter via `google_fonts` (cached after
/// > first load). Before release we'll bundle the Inter `.ttf` files as an asset
/// > to kill the first-run network fetch and any font flash.
abstract final class AppTypography {
  static TextTheme textTheme(Color fg, Color fgMuted) {
    // `.apply` FIRST, then `copyWith`. This order is load-bearing: `copyWith`
    // only touches the styles named below, and every style NOT named falls
    // through to Material's default typography, whose colour is BLACK — so on
    // the dark theme it renders invisible against the navy surface.
    //
    // That is not hypothetical: `headlineSmall` was missing here, and it is the
    // style used by the job title, the article title, the home greeting and the
    // OTP field — all four were unreadable in dark mode. Colouring the base
    // means a style added later can never reintroduce the bug.
    final base = GoogleFonts.interTextTheme().apply(
      bodyColor: fg,
      displayColor: fg,
    );
    return base.copyWith(
      headlineLarge: GoogleFonts.inter(
        fontSize: 30,
        fontWeight: FontWeight.w700,
        height: 1.18,
        letterSpacing: -0.5,
        color: fg,
      ),
      headlineMedium: GoogleFonts.inter(
        fontSize: 24,
        fontWeight: FontWeight.w700,
        height: 1.22,
        letterSpacing: -0.3,
        color: fg,
      ),
      // Screen titles — the job title, the article title, the home greeting.
      // Explicit rather than inherited, so it carries the same tight tracking
      // as the rest of the headline family instead of Material's looser default.
      headlineSmall: GoogleFonts.inter(
        fontSize: 20,
        fontWeight: FontWeight.w700,
        height: 1.25,
        letterSpacing: -0.2,
        color: fg,
      ),
      titleLarge: GoogleFonts.inter(
        fontSize: 20,
        fontWeight: FontWeight.w600,
        height: 1.3,
        letterSpacing: -0.2,
        color: fg,
      ),
      titleMedium: GoogleFonts.inter(
        fontSize: 16,
        fontWeight: FontWeight.w600,
        height: 1.35,
        color: fg,
      ),
      titleSmall: GoogleFonts.inter(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        height: 1.35,
        color: fg,
      ),
      bodyLarge: GoogleFonts.inter(
        fontSize: 16,
        fontWeight: FontWeight.w400,
        height: 1.5,
        color: fg,
      ),
      bodyMedium: GoogleFonts.inter(
        fontSize: 14,
        fontWeight: FontWeight.w400,
        height: 1.5,
        color: fgMuted,
      ),
      bodySmall: GoogleFonts.inter(
        fontSize: 12,
        fontWeight: FontWeight.w400,
        height: 1.45,
        color: fgMuted,
      ),
      labelLarge: GoogleFonts.inter(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        height: 1.2,
        letterSpacing: 0.1,
        color: fg,
      ),
      labelMedium: GoogleFonts.inter(
        fontSize: 12,
        fontWeight: FontWeight.w500,
        height: 1.2,
        letterSpacing: 0.2,
        color: fgMuted,
      ),
      labelSmall: GoogleFonts.inter(
        fontSize: 11,
        fontWeight: FontWeight.w600,
        height: 1.2,
        letterSpacing: 0.4,
        color: fgMuted,
      ),
    );
  }
}
