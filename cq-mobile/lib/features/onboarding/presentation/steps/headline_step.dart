import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../core/theme/app_spacing.dart';
import '../../data/candidate_profile.dart';
import '../../data/onboarding_repository.dart';
import '../widgets/onboarding_widgets.dart';

/// Step 3 — headline & preferences. Preferred-city and resume are intentionally
/// left out for now: cities need a catalogue API the backend doesn't expose, and
/// resume upload (multipart + virus scan) ships in a follow-up.
class HeadlineStep extends StatefulWidget {
  const HeadlineStep({super.key, required this.initial});

  final CandidateProfile initial;

  @override
  State<HeadlineStep> createState() => HeadlineStepState();
}

class HeadlineStepState extends State<HeadlineStep> {
  final _headline = TextEditingController();
  final _salary = TextEditingController();
  String? _gender;

  @override
  void initState() {
    super.initState();
    final i = widget.initial;
    _headline.text = i.headline ?? '';
    _salary.text = i.expectedSalaryMinPaise != null
        ? (i.expectedSalaryMinPaise! ~/ 100).toString()
        : '';
    _gender = i.gender;
  }

  @override
  void dispose() {
    _headline.dispose();
    _salary.dispose();
    super.dispose();
  }

  Future<String?> save(OnboardingRepository repo) async {
    final body = <String, dynamic>{};
    if (_headline.text.trim().isNotEmpty) {
      body['headline'] = _headline.text.trim();
    }
    final salaryText = _salary.text.trim();
    if (salaryText.isNotEmpty) {
      final rupees = int.tryParse(salaryText);
      if (rupees == null || rupees < 0) {
        return 'Enter your expected salary as a number.';
      }
      body['expectedSalaryMinPaise'] = rupees * 100;
    }
    if (_gender != null) body['gender'] = _gender;

    try {
      await repo.patchProfile(body);
      return null;
    } on OnboardingException catch (e) {
      return e.message;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const OnboardingLabel('Profile headline', optional: true),
        TextField(
          controller: _headline,
          maxLength: 250,
          maxLines: 2,
          textCapitalization: TextCapitalization.sentences,
          decoration: const InputDecoration(
            hintText: 'e.g. Frontend developer skilled in Flutter & React',
            counterText: '',
          ),
        ),
        const SizedBox(height: AppSpacing.lg),

        const OnboardingLabel('Expected annual salary (₹)', optional: true),
        TextField(
          controller: _salary,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: const InputDecoration(
            hintText: 'e.g. 800000',
            prefixIcon: Icon(Icons.currency_rupee_rounded),
          ),
        ),
        const SizedBox(height: AppSpacing.xl),

        const OnboardingLabel('Gender', optional: true),
        CqSegmented<String>(
          options: const [
            CqOption('MALE', 'Male'),
            CqOption('FEMALE', 'Female'),
            CqOption('PREFER_NOT_TO_SAY', 'Prefer not to say'),
          ],
          value: _gender,
          onChanged: (v) => setState(() => _gender = v),
        ),
      ],
    );
  }
}
