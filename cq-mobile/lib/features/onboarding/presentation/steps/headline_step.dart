import 'package:flutter/material.dart';

import '../../../../core/format/salary_input.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../catalogs/data/catalog_models.dart';
import '../../../catalogs/presentation/catalog_picker.dart';
import '../../../resume/presentation/resume_section.dart';
import '../../data/candidate_profile.dart';
import '../../data/onboarding_repository.dart';
import '../widgets/onboarding_widgets.dart';

/// Step 3 — headline & preferences.
///
/// Industry, preferred cities and the CV are collected here, matching the
/// website's final onboarding step.
///
/// Nothing is pre-filled and nothing is sent unless the candidate picks it in
/// this session. That is deliberate: PATCH /me/profile replaces
/// `preferredCityIds` wholesale, so a pre-fill that failed to load would render
/// as "Any location" and then overwrite a real list with whatever single city
/// the candidate happened to tap. Onboarding runs immediately after
/// registration, so there is nothing to pre-fill in practice anyway.
class HeadlineStep extends StatefulWidget {
  const HeadlineStep({super.key, required this.initial});

  final CandidateProfile initial;

  @override
  State<HeadlineStep> createState() => HeadlineStepState();
}

class HeadlineStepState extends State<HeadlineStep> {
  final _headline = TextEditingController();
  int? _salaryLpa;
  int? _loadedSalaryPaise;
  String? _gender;
  CatalogItem? _industry;
  List<CatalogItem> _cities = const [];

  @override
  void initState() {
    super.initState();
    final i = widget.initial;
    _headline.text = i.headline ?? '';
    _loadedSalaryPaise = i.expectedSalaryMinPaise;
    _salaryLpa = lpaFromPaise(i.expectedSalaryMinPaise);
    _gender = i.gender;
  }

  @override
  void dispose() {
    _headline.dispose();
    super.dispose();
  }

  Future<String?> save(OnboardingRepository repo) async {
    final body = <String, dynamic>{};
    if (_headline.text.trim().isNotEmpty) {
      body['headline'] = _headline.text.trim();
    }
    final salaryPaise =
        paiseForLpa(_salaryLpa, unchangedFrom: _loadedSalaryPaise);
    if (salaryPaise != null) body['expectedSalaryMinPaise'] = salaryPaise;
    if (_gender != null) body['gender'] = _gender;
    if (_industry != null) body['industryId'] = _industry!.id;
    if (_cities.isNotEmpty) {
      body['preferredCityIds'] = [for (final c in _cities) c.id];
    }

    try {
      await repo.patchProfile(body);
      return null;
    } on OnboardingException catch (e) {
      return e.message;
    }
  }

  Widget _picker(String text, VoidCallback onTap) {
    final cq = context.cq;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppRadius.md),
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: 14,
        ),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(AppRadius.md),
          border: Border.all(color: cq.border),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(text, maxLines: 2, overflow: TextOverflow.ellipsis),
            ),
            Icon(Icons.chevron_right_rounded, color: cq.fgSubtle),
          ],
        ),
      ),
    );
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

        // Lakhs per annum, matching the profile editor and every salary the
        // app displays. This used to be a free-text rupees box: a candidate who
        // thinks in packages — as most here do — typed 12 meaning 12 LPA and
        // saved an expected salary of twelve rupees.
        const OnboardingLabel('Expected salary (LPA)', optional: true),
        DropdownButtonFormField<int?>(
          initialValue: _salaryLpa,
          isExpanded: true,
          decoration: const InputDecoration(hintText: 'Not set'),
          items: [
            const DropdownMenuItem(value: null, child: Text('Not set')),
            for (final l in <int>{?_salaryLpa, ...salaryLpaOptions}.toList()
              ..sort())
              DropdownMenuItem(value: l, child: Text('₹$l LPA')),
          ],
          onChanged: (v) => setState(() => _salaryLpa = v),
        ),
        const SizedBox(height: AppSpacing.xl),

        const OnboardingLabel('Industry', optional: true),
        _picker(
          _industry?.name ?? 'Any industry',
          () async {
            final res = await showCatalogPicker(
              context: context,
              kind: CatalogKind.industries,
              title: 'Industry',
              initial: _industry == null ? const [] : [_industry!],
            );
            if (res != null) {
              setState(() => _industry = res.isEmpty ? null : res.first);
            }
          },
        ),
        const SizedBox(height: AppSpacing.lg),

        const OnboardingLabel('Preferred locations', optional: true),
        _picker(
          _cities.isEmpty
              ? 'Any location'
              : _cities.map((c) => c.name).join(', '),
          () async {
            final res = await showCatalogPicker(
              context: context,
              kind: CatalogKind.cities,
              title: 'Preferred locations',
              multi: true,
              initial: _cities,
            );
            if (res != null) setState(() => _cities = res);
          },
        ),
        const SizedBox(height: AppSpacing.xl),

        const OnboardingLabel('Resume', optional: true),
        const SizedBox(height: AppSpacing.sm),
        // The same card the profile uses — it loads, uploads, replaces and
        // reports its own failures, so onboarding does not reimplement any of
        // that. A CV added here is immediately usable by the apply flow.
        const ResumeCard(),
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
