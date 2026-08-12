// One-off helper: turns the wide CQ mark into properly-padded square icon
// assets for flutter_launcher_icons + flutter_native_splash.
//
//   dart run tool/gen_app_icon.dart
//
// Produces:
//   assets/icon/app_icon.png            1024² white background + centred mark
//   assets/icon/app_icon_foreground.png 1024² transparent + smaller mark (adaptive/A12 safe-zone)
import 'dart:io';

import 'package:image/image.dart' as img;

void main() {
  // The ACTUAL brand mark (navy C+Q + cyan arrow), unaltered — just placed on a
  // clean white tile. Never recoloured (trademark).
  final mark = img.decodePng(File('assets/icon/cq_icon.png').readAsBytesSync());
  if (mark == null) {
    stderr.writeln('Could not read assets/icon/cq_icon.png');
    exit(1);
  }

  const size = 1024;

  img.Image place(double widthFraction, {img.Color? background}) {
    final canvas = img.Image(width: size, height: size, numChannels: 4);
    if (background != null) {
      img.fill(canvas, color: background);
    }
    final targetW = (size * widthFraction).round();
    final scale = targetW / mark.width;
    final targetH = (mark.height * scale).round();
    final resized = img.copyResize(
      mark,
      width: targetW,
      height: targetH,
      interpolation: img.Interpolation.cubic,
    );
    img.compositeImage(
      canvas,
      resized,
      dstX: ((size - targetW) / 2).round(),
      dstY: ((size - targetH) / 2).round(),
    );
    return canvas;
  }

  // Opaque icon (iOS + legacy Android): brand-navy bg, white mark at 70% width.
  final icon = place(0.72, background: img.ColorRgb8(255, 255, 255));
  File('assets/icon/app_icon.png').writeAsBytesSync(img.encodePng(icon));

  // Transparent foreground (Android adaptive + A12 splash): white mark at 56%
  // width, leaving the safe-zone padding the OS masks expect.
  final foreground = place(0.56);
  File(
    'assets/icon/app_icon_foreground.png',
  ).writeAsBytesSync(img.encodePng(foreground));

  // Fully transparent placeholder — the native splash uses this as its "image"
  // so the launch screen is a plain light colour (no static logo), letting the
  // animated Dart splash play cleanly on top.
  File('assets/icon/blank.png').writeAsBytesSync(
    img.encodePng(img.Image(width: 512, height: 512, numChannels: 4)),
  );

  stdout.writeln('Generated app_icon.png + app_icon_foreground.png + blank.png');
}
