import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../core/theme/app_spacing.dart';
import '../../data/candidate_profile.dart';
import '../../data/onboarding_repository.dart';
import '../widgets/onboarding_widgets.dart';

/// Step 1 — employment & professional details. Mirrors the website's first step
/// (work status, looking-for, experience, current job, skills). Industry is
/// omitted here because it needs a catalogue API the backend doesn't expose.
class WorkProfileStep extends StatefulWidget {
  const WorkProfileStep({super.key, required this.initial});

  final CandidateProfile initial;

  @override
  State<WorkProfileStep> createState() => WorkProfileStepState();
}

class WorkProfileStepState extends State<WorkProfileStep> {
  String? _workStatus;
  String? _lookingFor;
  int _expYears = 0;
  int _expMonths = 0;
  int? _noticeDays;
  List<String> _skills = [];

  final _company = TextEditingController();
  final _title = TextEditingController();
  final _salary = TextEditingController();
  final _city = TextEditingController();

  @override
  void initState() {
    super.initState();
    final i = widget.initial;
    _workStatus = i.workStatus;
    _lookingFor = i.lookingFor;
    final months = i.experienceMonths ?? 0;
    _expYears = (months ~/ 12).clamp(0, 40);
    _expMonths = months % 12;
    _noticeDays = i.noticePeriodDays;
    _company.text = i.currentCompanyName ?? '';
    _title.text = i.currentTitle ?? '';
    _salary.text = i.currentSalaryPaise != null
        ? (i.currentSalaryPaise! ~/ 100).toString()
        : '';
    _city.text = i.currentCityName ?? '';
  }

  @override
  void dispose() {
    _company.dispose();
    _title.dispose();
    _salary.dispose();
    _city.dispose();
    super.dispose();
  }

  /// Persists this step. Returns an error message, or null on success.
  Future<String?> save(OnboardingRepository repo) async {
    final body = <String, dynamic>{};
    if (_workStatus != null) body['workStatus'] = _workStatus;
    if (_lookingFor != null) body['lookingFor'] = _lookingFor;

    if (_workStatus == 'EXPERIENCED') {
      body['experienceMonths'] = _expYears * 12 + _expMonths;
      final salaryText = _salary.text.trim();
      if (salaryText.isNotEmpty) {
        final rupees = int.tryParse(salaryText);
        if (rupees == null || rupees < 0) {
          return 'Enter your annual salary as a number.';
        }
        body['currentSalaryPaise'] = rupees * 100;
      }
      if (_company.text.trim().isNotEmpty) {
        body['currentCompanyName'] = _company.text.trim();
      }
      if (_title.text.trim().isNotEmpty) {
        body['currentTitle'] = _title.text.trim();
      }
      if (_noticeDays != null) body['noticePeriodDays'] = _noticeDays;
    } else if (_workStatus == 'FRESHER') {
      body['experienceMonths'] = 0;
    }
    if (_city.text.trim().isNotEmpty) {
      body['currentCityName'] = _city.text.trim();
    }

    try {
      await repo.patchProfile(body);
      if (_skills.isNotEmpty) await repo.saveSkills(customSkills: _skills);
      return null;
    } on OnboardingException catch (e) {
      return e.message;
    }
  }

  @override
  Widget build(BuildContext context) {
    final experienced = _workStatus == 'EXPERIENCED';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const OnboardingLabel('I am a'),
        CqSegmented<String>(
          options: const [
            CqOption('FRESHER', 'Fresher'),
            CqOption('EXPERIENCED', 'Experienced'),
          ],
          value: _workStatus,
          onChanged: (v) => setState(() => _workStatus = v),
        ),
        const SizedBox(height: AppSpacing.xl),

        const OnboardingLabel('Looking for'),
        CqSegmented<String>(
          options: const [
            CqOption('JOB', 'Job'),
            CqOption('INTERNSHIP', 'Internship'),
            CqOption('BOTH', 'Both'),
          ],
          value: _lookingFor,
          onChanged: (v) => setState(() => _lookingFor = v),
        ),

        if (experienced) ...[
          const SizedBox(height: AppSpacing.xl),
          const OnboardingLabel('Total experience'),
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<int>(
                  initialValue: _expYears,
                  decoration: const InputDecoration(labelText: 'Years'),
                  items: [
                    for (var y = 0; y <= 40; y++)
                      DropdownMenuItem(value: y, child: Text('$y')),
                  ],
                  onChanged: (v) => setState(() => _expYears = v ?? 0),
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: DropdownButtonFormField<int>(
                  initialValue: _expMonths,
                  decoration: const InputDecoration(labelText: 'Months'),
                  items: [
                    for (var m = 0; m <= 11; m++)
                      DropdownMenuItem(value: m, child: Text('$m')),
                  ],
                  onChanged: (v) => setState(() => _expMonths = v ?? 0),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          const OnboardingLabel('Current company', optional: true),
          TextField(
            controller: _company,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(
              hintText: 'Company name',
              prefixIcon: Icon(Icons.business_outlined),
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          const OnboardingLabel('Designation', optional: true),
          TextField(
            controller: _title,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(
              hintText: 'e.g. Software Engineer',
              prefixIcon: Icon(Icons.badge_outlined),
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          const OnboardingLabel('Current annual salary (₹)', optional: true),
          TextField(
            controller: _salary,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: const InputDecoration(
              hintText: 'e.g. 600000',
              prefixIcon: Icon(Icons.currency_rupee_rounded),
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          const OnboardingLabel('Notice period', optional: true),
          DropdownButtonFormField<int>(
            initialValue: _noticeDays,
            decoration: const InputDecoration(hintText: 'Select'),
            items: const [
              DropdownMenuItem(value: 0, child: Text('Immediately')),
              DropdownMenuItem(value: 15, child: Text('15 days')),
              DropdownMenuItem(value: 30, child: Text('30 days')),
              DropdownMenuItem(value: 60, child: Text('60 days')),
              DropdownMenuItem(value: 90, child: Text('90 days')),
            ],
            onChanged: (v) => setState(() => _noticeDays = v),
          ),
        ],

        const SizedBox(height: AppSpacing.xl),
        const OnboardingLabel('Current city', optional: true),
        TextField(
          controller: _city,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(
            hintText: 'e.g. Bengaluru',
            prefixIcon: Icon(Icons.location_on_outlined),
          ),
        ),

        const SizedBox(height: AppSpacing.xl),
        const OnboardingLabel('Key skills', optional: true),
        SkillTagsInput(
          skills: _skills,
          onChanged: (s) => setState(() => _skills = s),
        ),
      ],
    );
  }
}
