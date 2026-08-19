/// How a PATCH body treats a field the user emptied.
///
/// The API's profile and education endpoints are PATCHes, so a key that is
/// absent from the body means "leave this alone". Both editors used to skip a
/// field whose text was empty, which reads like tidiness and is actually a
/// silent no-op: a candidate who deleted their headline, their grade or their
/// field of study saved successfully, saw no error, and found the old value
/// back on the next load with nothing to explain it.
///
/// These two helpers exist so the distinction is stated once and cannot be
/// "tidied" back by someone who has not read the DTOs.
library;

/// Send the value even when it is empty, so clearing the field clears the
/// column.
///
/// Correct for every free-text field whose DTO is `z.string().max(N).optional()`
/// with no minimum — headline, summary, currentTitle, currentCompanyName,
/// currentCityName, fieldOfStudy, grade. The service layer's `stripUndefined`
/// removes only `undefined`, so `''` reaches the database.
void putClearable(Map<String, dynamic> body, String key, String value) {
  body[key] = value.trim();
}

/// Omit the key when the value is empty.
///
/// For fields whose DTO cannot accept `''`, where sending it is a 400 rather
/// than a clear. `phone` is the one in practice: `/^[+0-9 \-()]{6,20}$/`.
void putNonEmpty(Map<String, dynamic> body, String key, String value) {
  final trimmed = value.trim();
  if (trimmed.isNotEmpty) body[key] = trimmed;
}
