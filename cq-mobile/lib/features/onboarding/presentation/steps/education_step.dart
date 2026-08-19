import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../data/onboarding_repository.dart';
import '../widgets/onboarding_widgets.dart';

/// Step 2 — education: the most recent degree + Class 12. Both are free-text +
/// year pickers (no catalogue needed). Each section is created on first save and
/// updated (not duplicated) if the user goes back and re-saves.
class EducationStep extends StatefulWidget {
  const EducationStep({super.key});

  @override
  State<EducationStep> createState() => EducationStepState();
}

class EducationStepState extends State<EducationStep> {
  final _degInstitute = TextEditingController();
  final _degName = TextEditingController();
  final _degField = TextEditingController();
  final _degGrade = TextEditingController();
  int? _degStart, _degEnd;
  bool _degPursuing = false;
  int? _degreeId; // set after first create

  final _c12Institute = TextEditingController();
  int? _c12Start, _c12End;
  bool _c12Pursuing = false;
  int? _class12Id;

  late final List<int> _years;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now().year;
    _years = [for (var y = now + 8; y >= 1950; y--) y];
  }

  @override
  void dispose() {
    _degInstitute.dispose();
    _degName.dispose();
    _degField.dispose();
    _degGrade.dispose();
    _c12Institute.dispose();
    super.dispose();
  }

  Future<String?> save(OnboardingRepository repo) async {
    // ── Degree ──
    if (_degInstitute.text.trim().isNotEmpty) {
      final degree = _degName.text.trim();
      if (degree.isEmpty) return 'Enter your degree name.';
      if (_degStart == null) return 'Select your degree start year.';
      if (!_degPursuing && _degEnd == null) {
        return 'Select your degree end year, or mark it as currently pursuing.';
      }
      if (!_degPursuing && _degEnd! < _degStart!) {
        return 'Degree end year must be the same as or after the start year.';
      }
      final body = <String, dynamic>{
        'institute': _degInstitute.text.trim(),
        'degree': degree,
        'startYear': _degStart,
        'endYear': _degPursuing ? null : _degEnd,
        if (_degField.text.trim().isNotEmpty) 'fieldOfStudy': _degField.text.trim(),
        if (_degGrade.text.trim().isNotEmpty) 'grade': _degGrade.text.trim(),
      };
      try {
        if (_degreeId == null) {
          _degreeId = await repo.createEducation(body);
        } else {
          await repo.updateEducation(_degreeId!, body);
        }
      } on OnboardingException catch (e) {
        return e.message;
      }
    }

    // ── Class 12 ──
    if (_c12Institute.text.trim().isNotEmpty) {
      if (_c12Start == null) return 'Select your Class 12 start year.';
      if (!_c12Pursuing && _c12End == null) {
        return 'Select your Class 12 end year, or mark it as currently pursuing.';
      }
      if (!_c12Pursuing && _c12End! < _c12Start!) {
        return 'Class 12 end year must be the same as or after the start year.';
      }
      final body = <String, dynamic>{
        'institute': _c12Institute.text.trim(),
        'degree': 'Class XII',
        'startYear': _c12Start,
        'endYear': _c12Pursuing ? null : _c12End,
      };
      try {
        if (_class12Id == null) {
          _class12Id = await repo.createEducation(body);
        } else {
          await repo.updateEducation(_class12Id!, body);
        }
      } on OnboardingException catch (e) {
        return e.message;
      }
    }
    return null;
  }

  Widget _yearField({
    required String label,
    required int? value,
    required ValueChanged<int?> onChanged,
  }) {
    return DropdownButtonFormField<int>(
      initialValue: value,
      isExpanded: true,
      decoration: InputDecoration(labelText: label),
      items: [
        for (final y in _years) DropdownMenuItem(value: y, child: Text('$y')),
      ],
      onChanged: onChanged,
    );
  }

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Degree / graduation',
          style: Theme.of(
            context,
          ).textTheme.titleMedium?.copyWith(color: cq.fg),
        ),
        const SizedBox(height: AppSpacing.lg),
        const OnboardingLabel('College / university'),
        TextField(
          controller: _degInstitute,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(
            hintText: 'e.g. Delhi University',
          ),
        ),
        const SizedBox(height: AppSpacing.xl2),
        const OnboardingLabel('Degree'),
        TextField(
          controller: _degName,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(
            hintText: 'e.g. B.Tech',
          ),
        ),
        const SizedBox(height: AppSpacing.xl2),
        const OnboardingLabel('Field of study', optional: true),
        TextField(
          controller: _degField,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(
            hintText: 'e.g. Computer Science',
          ),
        ),
        const SizedBox(height: AppSpacing.xl2),
        Row(
          children: [
            Expanded(
              child: _yearField(
                label: 'Start year',
                value: _degStart,
                onChanged: (v) => setState(() => _degStart = v),
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: _degPursuing
                  ? const SizedBox()
                  : _yearField(
                      label: 'End year',
                      value: _degEnd,
                      onChanged: (v) => setState(() => _degEnd = v),
                    ),
            ),
          ],
        ),
        CheckboxListTile(
          value: _degPursuing,
          onChanged: (v) => setState(() => _degPursuing = v ?? false),
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          title: const Text('Currently pursuing'),
        ),
        const SizedBox(height: AppSpacing.xl2),
        const OnboardingLabel('Grade / CGPA', optional: true),
        TextField(
          controller: _degGrade,
          decoration: const InputDecoration(
            hintText: 'e.g. 8.4 CGPA',
          ),
        ),

        const SizedBox(height: AppSpacing.xl),
        Divider(color: cq.border),
        const SizedBox(height: AppSpacing.lg),

        Text(
          'Class 12',
          style: Theme.of(
            context,
          ).textTheme.titleMedium?.copyWith(color: cq.fg),
        ),
        const SizedBox(height: AppSpacing.lg),
        const OnboardingLabel('School name'),
        TextField(
          controller: _c12Institute,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(
            hintText: 'e.g. Kendriya Vidyalaya',
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        Row(
          children: [
            Expanded(
              child: _yearField(
                label: 'Start year',
                value: _c12Start,
                onChanged: (v) => setState(() => _c12Start = v),
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: _c12Pursuing
                  ? const SizedBox()
                  : _yearField(
                      label: 'End year',
                      value: _c12End,
                      onChanged: (v) => setState(() => _c12End = v),
                    ),
            ),
          ],
        ),
        CheckboxListTile(
          value: _c12Pursuing,
          onChanged: (v) => setState(() => _c12Pursuing = v ?? false),
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          title: const Text('Currently pursuing'),
        ),
      ],
    );
  }
}
