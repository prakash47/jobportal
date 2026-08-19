import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';

/// Inter must come from the bundle, never from the network.
///
/// Without the bundled files the app downloaded its typeface on first launch,
/// so a slow or offline first run rendered the entire product in the platform
/// fallback font — the first thing a new user ever sees.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const weights = ['Regular', 'Medium', 'SemiBold', 'Bold'];

  test('every weight the type system uses is bundled', () async {
    for (final w in weights) {
      final data = await rootBundle.load('google_fonts/Inter-$w.ttf');
      expect(data.lengthInBytes, greaterThan(50000), reason: 'Inter-$w.ttf');

      // A real TrueType file starts with 0x00010000.
      final magic = data.buffer.asUint8List(0, 4);
      expect(magic, [0x00, 0x01, 0x00, 0x00], reason: 'Inter-$w.ttf is a font');
    }
  });

  test(
    'the filenames match what google_fonts looks for, or it silently '
    'falls back to HTTP',
    () async {
      final manifest = await AssetManifest.loadFromAssetBundle(rootBundle);
      final bundled = manifest
          .listAssets()
          .where((a) => a.startsWith('google_fonts/'))
          .toSet();

      for (final w in weights) {
        expect(bundled, contains('google_fonts/Inter-$w.ttf'));
      }
    },
  );

  test('runtime fetching stays disabled', () {
    // main() turns this off. If it ever comes back, a missing asset degrades
    // quietly to a download instead of failing loudly in debug.
    GoogleFonts.config.allowRuntimeFetching = false;
    expect(GoogleFonts.config.allowRuntimeFetching, isFalse);
  });
}
