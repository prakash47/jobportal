// Form validators for the auth screens.
//
// The password rule mirrors the server exactly (Career Queue `RegisterDto`:
// 8+ chars, >=1 digit, >=1 special character), so we fail fast with a helpful
// message instead of a round-trip 400.

String? validateName(String? value) {
  final v = (value ?? '').trim();
  if (v.isEmpty) return 'Enter your name';
  if (v.length > 120) return 'Name is too long';
  return null;
}

String? validateEmail(String? value) {
  final v = (value ?? '').trim();
  if (v.isEmpty) return 'Enter your email';
  final ok = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(v);
  return ok ? null : 'Enter a valid email address';
}

String? validateRequiredPassword(String? value) {
  if (value == null || value.isEmpty) return 'Enter your password';
  return null;
}

String? validateNewPassword(String? value) {
  final v = value ?? '';
  if (v.isEmpty) return 'Create a password';
  if (v.length < 8) return 'Use at least 8 characters';
  if (!RegExp(r'\d').hasMatch(v)) return 'Add at least 1 number';
  if (!RegExp(r"""[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]""").hasMatch(v)) {
    return 'Add at least 1 special character';
  }
  return null;
}

String? validateOptionalPhone(String? value) {
  final v = (value ?? '').trim();
  if (v.isEmpty) return null; // phone is optional
  if (v.length < 7 || v.length > 20) return 'Enter a valid phone number';
  return null;
}
