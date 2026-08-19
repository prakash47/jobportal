/// The one place that knows how an expected salary is *entered*.
///
/// Display lives in `job_format.dart`; this is its input twin. It exists
/// because the same profile field was being captured in two different units —
/// the onboarding wizard asked for rupees per year while the profile editor
/// asked for LPA, so "12" meant ₹12 in one screen and ₹12,00,000 in the other.
/// Both now import from here, so they cannot drift apart again.
library;

/// Paise in one lakh per annum. The API stores every salary in paise.
const paisePerLpa = 10000000;

/// The curated ladder offered in both screens. A free-text box invites the
/// unit confusion this file exists to remove, and on a phone a picker is
/// fewer taps besides.
const salaryLpaOptions = <int>[3, 5, 7, 10, 12, 15, 20, 25, 30, 40, 50, 75, 100];

/// paise → whole LPA for display in the picker.
///
/// Rounds, because the picker only offers whole numbers — which is exactly why
/// [paiseForLpa] has to be told what the original value was.
int? lpaFromPaise(int? paise) =>
    paise == null ? null : (paise / paisePerLpa).round();

/// LPA → paise, *preserving a value the user never touched*.
///
/// The picker is whole-LPA only, so a stored ₹8,50,000 renders as 9. Multiplying
/// that back out would silently write ₹9,00,000 — a candidate who opened the
/// editor to fix a typo in their headline would leave with a salary they never
/// typed, and would have no way to notice. When the selection still matches
/// what was loaded, the original paise are returned untouched.
int? paiseForLpa(int? lpa, {int? unchangedFrom}) {
  if (lpa == null) return null;
  if (unchangedFrom != null && lpaFromPaise(unchangedFrom) == lpa) {
    return unchangedFrom;
  }
  return lpa * paisePerLpa;
}
