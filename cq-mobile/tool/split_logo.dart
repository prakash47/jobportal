// One-off helper: splits the full CQ logo into two transparent PNG layers so the
// splash screen can animate the cyan arrow independently of the navy letters.
// The colours are never altered — pixels are only *sorted* into two files by
// hue (trademark-safe).
//
//   dart run tool/split_logo.dart
//
// Produces (same canvas size as the source, so they overlay perfectly):
//   assets/images/cq_letters_wordmark.png  navy "CQ" + "Career Queue"
//   assets/images/cq_arrow_part.png        the cyan arrow only
import 'dart:io';

import 'package:image/image.dart' as img;

void main() {
  final src = img.decodePng(
    File('assets/images/cq_logo.png').readAsBytesSync(),
  );
  if (src == null) {
    stderr.writeln('Could not read assets/images/cq_logo.png');
    exit(1);
  }

  final w = src.width, h = src.height;
  final letters = img.Image(width: w, height: h, numChannels: 4);
  final arrow = img.Image(width: w, height: h, numChannels: 4);

  var cyanCount = 0, letterCount = 0;
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      final p = src.getPixel(x, y);
      final a = p.a.toInt();
      if (a < 16) continue; // transparent background — leave both layers clear

      final r = p.r.toInt(), g = p.g.toInt(), b = p.b.toInt();
      // The arrow is distinctly cyan: blue leads, green is strong, red is low.
      final isCyan = b > 130 && g > 105 && b > r + 25;
      if (isCyan) {
        arrow.setPixelRgba(x, y, r, g, b, a);
        cyanCount++;
      } else {
        letters.setPixelRgba(x, y, r, g, b, a);
        letterCount++;
      }
    }
  }

  File(
    'assets/images/cq_letters_wordmark.png',
  ).writeAsBytesSync(img.encodePng(letters));
  File(
    'assets/images/cq_arrow_part.png',
  ).writeAsBytesSync(img.encodePng(arrow));

  stdout.writeln('Source ${w}x$h');
  stdout.writeln('  letters/wordmark pixels: $letterCount');
  stdout.writeln('  arrow (cyan) pixels:     $cyanCount');
  stdout.writeln('Wrote cq_letters_wordmark.png + cq_arrow_part.png');
}
