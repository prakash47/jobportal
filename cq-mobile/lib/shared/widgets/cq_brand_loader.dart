import 'package:flutter/material.dart';

/// "The Advance" — the CQ brand loader, ported from the website.
///
/// The cyan arrow starts hidden behind a static clip seam inside the C, glides
/// right until it docks against the Q, holds dead still as the exact static
/// lockup, fades out, resets behind the seam, and repeats.
///
/// **Every number here is copied from the website, not approximated** —
/// `packages/ui/src/components/molecules/BrandLoader.tsx` for the geometry and
/// `packages/ui/src/styles/theme.css` (`@keyframes cq-loader-advance`) for the
/// timing. The two surfaces have to draw the same mark; an eyeballed port would
/// drift the moment either side is touched.
///
/// The arrow's UNTRANSFORMED coordinates are its docked position — the keyframes
/// move it *away* from rest. That is why the reduced-motion path parks it at
/// dx 0 rather than at the start: with animations off, the mark must read as the
/// finished logo, not as a logo missing its arrow.
class CqBrandLoader extends StatefulWidget {
  const CqBrandLoader({
    super.key,
    this.width = 132,
    this.semanticLabel = 'Loading',
    this.markColor,
  });

  /// Width of the mark. Height follows the 400:178 viewBox aspect.
  final double width;
  final String semanticLabel;

  /// Colour of the C and Q. Defaults to the brand navy on a light surface and
  /// to the foreground colour on a dark one — the website only ever draws this
  /// mark on a white veil, so a straight port would be navy-on-navy and
  /// invisible in the app's dark theme. The arrow stays cyan either way, which
  /// is the same treatment the splash screen uses.
  final Color? markColor;

  @override
  State<CqBrandLoader> createState() => _CqBrandLoaderState();
}

class _CqBrandLoaderState extends State<CqBrandLoader>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c;

  // The six keyframe stops are 0 / 33.33 / 58.33 / 77.77 / 78 / 82 / 100 %, so
  // the sequence weights below are the gaps between them and sum to 100.
  //
  // CSS easing → Flutter: `ease` is Curves.ease (0.25, 0.1, 0.25, 1) and
  // `ease-out` is Curves.easeOut (0, 0, 0.58, 1) — identical cubics, so these
  // are exact rather than lookalikes.
  static final Animatable<double> _dx = TweenSequence<double>([
    // ADVANCE — launched out of the C.
    TweenSequenceItem(
      tween: Tween<double>(begin: -104, end: 0)
          .chain(CurveTween(curve: const Cubic(0.22, 1.0, 0.36, 1.0))),
      weight: 33.33,
    ),
    // HOLD — total stillness, the static lockup.
    TweenSequenceItem(tween: ConstantTween<double>(0), weight: 25.0),
    // HANDOFF — docked, fading (position unchanged).
    TweenSequenceItem(tween: ConstantTween<double>(0), weight: 19.44),
    // The CSS jumps back over a 0.23% sliver; invisible, opacity is already 0.
    TweenSequenceItem(tween: Tween<double>(begin: 0, end: -104), weight: 0.23),
    TweenSequenceItem(tween: ConstantTween<double>(-104), weight: 4.0),
    // REST — parked behind the seam. Opaque, but the clip hides it.
    TweenSequenceItem(tween: ConstantTween<double>(-104), weight: 18.0),
  ]);

  static final Animatable<double> _opacity = TweenSequence<double>([
    TweenSequenceItem(tween: ConstantTween<double>(1), weight: 33.33),
    TweenSequenceItem(tween: ConstantTween<double>(1), weight: 25.0),
    TweenSequenceItem(
      tween: Tween<double>(begin: 1, end: 0)
          .chain(CurveTween(curve: Curves.easeOut)),
      weight: 19.44,
    ),
    TweenSequenceItem(tween: ConstantTween<double>(0), weight: 0.23),
    TweenSequenceItem(
      tween:
          Tween<double>(begin: 0, end: 1).chain(CurveTween(curve: Curves.ease)),
      weight: 4.0,
    ),
    TweenSequenceItem(tween: ConstantTween<double>(1), weight: 18.0),
  ]);

  @override
  void initState() {
    super.initState();
    // 1800ms, infinite. The tempo NEVER changes on long waits — a queue
    // advancing at a constant rate is the trust signal (the website's own
    // design decision, kept here so the two feel like one product).
    _c = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    )..repeat();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    if (reduceMotion && _c.isAnimating) _c.stop();
    if (!reduceMotion && !_c.isAnimating) _c.repeat();

    final isDark = Theme.of(context).brightness == Brightness.dark;
    final mark = widget.markColor ??
        (isDark ? const Color(0xFFF7F9FC) : _CqMarkPainter.brandNavy);

    return Semantics(
      label: widget.semanticLabel,
      liveRegion: true,
      child: SizedBox(
        width: widget.width,
        height: widget.width * 178 / 400,
        child: reduceMotion
            ? CustomPaint(
                painter: _CqMarkPainter(dx: 0, opacity: 1, markColor: mark),
              )
            : AnimatedBuilder(
                animation: _c,
                builder: (_, _) => CustomPaint(
                  painter: _CqMarkPainter(
                    dx: _dx.evaluate(_c),
                    opacity: _opacity.evaluate(_c),
                    markColor: mark,
                  ),
                ),
              ),
      ),
    );
  }
}

/// Paints the CQ mark on the website's 400×178 canvas, then scales to fit.
class _CqMarkPainter extends CustomPainter {
  const _CqMarkPainter({
    required this.dx,
    required this.opacity,
    required this.markColor,
  });

  /// Arrow offset in viewBox units (-104 = behind the seam, 0 = docked).
  final double dx;
  final double opacity;
  final Color markColor;

  // The website's exact brand hexes. The app palette carries a one-digit drift
  // (navy #192349, cyan #24A0DB); these are the website's values, because this
  // widget is the website's mark and the two must not draw different logos.
  static const Color brandNavy = Color(0xFF192249);
  static const Color _cyan = Color(0xFF22A0DA);

  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 400.0);

    final markStroke = Paint()
      ..color = markColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = 33
      ..strokeCap = StrokeCap.butt;
    final markFill = Paint()
      ..color = markColor
      ..style = PaintingStyle.fill;

    // C — a stroked arc, transliterated from
    // 'M 179.7 34.9 A 61.5 61.5 0 1 0 118.1 135.4'. `arcToPoint` takes the same
    // large-arc / sweep flags as SVG, so this is the path itself, not a
    // recomputed centre-and-angles version of it.
    canvas.drawPath(
      Path()
        ..moveTo(179.7, 34.9)
        ..arcToPoint(
          const Offset(118.1, 135.4),
          radius: const Radius.circular(61.5),
          largeArc: true,
          clockwise: false,
        ),
      markStroke,
    );

    // Q — ring + tail.
    canvas.drawCircle(const Offset(284, 76.5), 61.5, markStroke);
    canvas.drawPath(
      Path()
        ..moveTo(315, 85)
        ..lineTo(360, 151)
        ..lineTo(339, 165)
        ..lineTo(295, 99)
        ..close(),
      markFill,
    );

    // The arrow, clipped by a STATIC seam so it can only ever be seen to the
    // right of the C's inner edge. At dx -104 it sits entirely outside the clip,
    // which is what makes it "emerge from the C" rather than slide in from
    // offscreen.
    canvas.save();
    canvas.clipPath(
      Path()
        ..moveTo(177.8, 96)
        ..lineTo(71.1, 196)
        ..lineTo(420, 196)
        ..lineTo(420, 96)
        ..close(),
    );
    canvas.translate(dx, 0);
    canvas.drawPath(
      Path()
        ..moveTo(149, 123)
        ..lineTo(187, 123)
        ..lineTo(187, 107)
        ..lineTo(227, 140)
        ..lineTo(187, 171)
        ..lineTo(187, 153)
        ..lineTo(117, 153)
        ..close(),
      Paint()
        ..color = _cyan.withValues(alpha: opacity)
        ..style = PaintingStyle.fill,
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(_CqMarkPainter old) =>
      old.dx != dx || old.opacity != opacity || old.markColor != markColor;
}
