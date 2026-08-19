import 'package:flutter/material.dart';

/// What a failed load should do to a screen that already has content on it.
///
/// Every list screen here follows the same shape: `_load()` catches, sets
/// `_error`, and `build` paints a full-screen error view whenever `_error` is
/// non-null. That is right for a first load and wrong for a refresh — pulling
/// to refresh in a lift or a tunnel took a screen full of results away and left
/// an error page, so the user lost what they had by asking for something newer,
/// and the way back was another successful request they were in no position to
/// make.
///
/// The rule is one line, and it was implemented twice inline before this file
/// existed — which is exactly how six other screens kept the old behaviour. The
/// full error view belongs to a screen with nothing to show.
///
/// Returns true when the failure has been reported as a snackbar and the caller
/// should keep what it has; false when the caller should fall back to its error
/// view.
bool keepContentOnFailure(
  BuildContext context,
  String message, {
  required bool hasContent,
}) {
  if (!hasContent) return false;
  // Silence would be its own bug: the user pulled, so something has to say that
  // nothing new arrived.
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
  return true;
}
