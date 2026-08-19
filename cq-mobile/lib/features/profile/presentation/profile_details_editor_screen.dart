import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/format/patch_body.dart';
import '../../../core/format/salary_input.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/cq_buttons.dart';
import '../../../shared/widgets/cq_loader.dart';
import '../../catalogs/data/catalog_models.dart';
import '../../catalogs/data/catalogs_repository.dart';
import '../../catalogs/presentation/catalog_picker.dart';
import '../../onboarding/data/onboarding_repository.dart';


/// Edit every profile detail in one place — the standalone replacement for
/// re-running the onboarding wizard. Loads the current profile, then PATCHes
/// only what changed to `/me/profile`. Returns `true` when saved.
class ProfileDetailsEditorScreen extends ConsumerStatefulWidget {
  const ProfileDetailsEditorScreen({super.key});

  @override
  ConsumerState<ProfileDetailsEditorScreen> createState() =>
      _ProfileDetailsEditorScreenState();
}

class _ProfileDetailsEditorScreenState
    extends ConsumerState<ProfileDetailsEditorScreen> {
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _headline = TextEditingController();
  final _summary = TextEditingController();
  final _currentTitle = TextEditingController();
  final _currentCompany = TextEditingController();
  final _currentCity = TextEditingController();

  String _workStatus = 'FRESHER'; // FRESHER | EXPERIENCED
  String? _lookingFor; // JOB | INTERNSHIP | BOTH
  int _expYears = 0;
  int _expMonths = 0;
  int? _loadedMinPaise, _loadedMaxPaise;
  int? _expMinLpa;
  int? _expMaxLpa;
  int? _noticeDays;
  String? _gender;
  CatalogItem? _industry;
  List<CatalogItem> _cities = [];

  /// Whether [_cities] reflects the server or is just its initial empty value.
  /// Sending `[]` because a lookup failed would wipe real preferences.
  bool _citiesLoaded = false;

  bool _loading = true;
  bool _saving = false;
  String? _loadError;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _headline.dispose();
    _summary.dispose();
    _currentTitle.dispose();
    _currentCompany.dispose();
    _currentCity.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final repo = await ref.read(onboardingRepositoryProvider.future);
      final p = await repo.loadProfile();
      final catalogs = await ref.read(catalogsRepositoryProvider.future);

      // Resolve catalogue ids → labels for the pickers.
      CatalogItem? industry;
      if (p.industryId != null) {
        final hits = await catalogs.resolve(CatalogKind.industries, [p.industryId!]);
        industry = hits.isNotEmpty ? hits.first : null;
      }
      // throwOnError: an empty list here would render as "Any location" and
      // the next save would then overwrite the real list with whatever the user
      // picked from that false starting point.
      final cities = p.preferredCityIds.isEmpty
          ? <CatalogItem>[]
          : await catalogs.resolve(
              CatalogKind.cities,
              p.preferredCityIds,
              throwOnError: true,
            );

      if (!mounted) return;
      _name.text = p.name ?? '';
      _phone.text = p.phone ?? '';
      _headline.text = p.headline ?? '';
      _summary.text = p.summary ?? '';
      _currentTitle.text = p.currentTitle ?? '';
      _currentCompany.text = p.currentCompanyName ?? '';
      _currentCity.text = p.currentCityName ?? '';
      setState(() {
        _workStatus = p.workStatus ?? 'FRESHER';
        _lookingFor = p.lookingFor;
        _expYears = ((p.experienceMonths ?? 0) ~/ 12).clamp(0, 40);
        _expMonths = ((p.experienceMonths ?? 0) % 12).clamp(0, 11);
        _loadedMinPaise = p.expectedSalaryMinPaise;
        _loadedMaxPaise = p.expectedSalaryMaxPaise;
        _expMinLpa = lpaFromPaise(p.expectedSalaryMinPaise);
        _expMaxLpa = lpaFromPaise(p.expectedSalaryMaxPaise);
        _noticeDays = p.noticePeriodDays;
        _gender = p.gender;
        _industry = industry;
        _cities = cities;
        _citiesLoaded = true;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loadError = switch (e) {
          OnboardingException(:final message) => message,
          // The catalogue lookup for industry / preferred cities failed. Say so
          // rather than opening the form with those fields falsely blank.
          CatalogsException(:final message) => message,
          _ => 'Could not load your profile.',
        };
        _loading = false;
      });
    }
  }


  Future<void> _pickIndustry() async {
    final res = await showCatalogPicker(
      context: context,
      kind: CatalogKind.industries,
      title: 'Industry',
      initial: _industry == null ? const [] : [_industry!],
    );
    if (res != null) setState(() => _industry = res.isEmpty ? null : res.first);
  }

  Future<void> _pickCities() async {
    final res = await showCatalogPicker(
      context: context,
      kind: CatalogKind.cities,
      title: 'Preferred cities',
      multi: true,
      initial: _cities,
    );
    if (res != null) setState(() => _cities = res);
  }

  Future<void> _save() async {
    FocusScope.of(context).unfocus();
    final name = _name.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Your name is required.');
      return;
    }
    if (_expMinLpa != null && _expMaxLpa != null && _expMinLpa! > _expMaxLpa!) {
      setState(() => _error = 'Minimum salary can’t be more than the maximum.');
      return;
    }

    final body = <String, dynamic>{'name': name};
    // See patch_body.dart for why an emptied field is SENT rather than
    // skipped, and why phone is the one exception.
    void putStr(String k, TextEditingController c) =>
        putClearable(body, k, c.text);

    putNonEmpty(body, 'phone', _phone.text);
    putStr('headline', _headline);
    putStr('summary', _summary);
    body['workStatus'] = _workStatus;
    if (_lookingFor != null) body['lookingFor'] = _lookingFor;
    if (_workStatus == 'EXPERIENCED') {
      body['experienceMonths'] = _expYears * 12 + _expMonths;
      putStr('currentTitle', _currentTitle);
      putStr('currentCompanyName', _currentCompany);
    }
    putStr('currentCityName', _currentCity);
    if (_industry != null) body['industryId'] = _industry!.id;
    final minPaise = paiseForLpa(_expMinLpa, unchangedFrom: _loadedMinPaise);
    final maxPaise = paiseForLpa(_expMaxLpa, unchangedFrom: _loadedMaxPaise);
    if (minPaise != null) body['expectedSalaryMinPaise'] = minPaise;
    if (maxPaise != null) body['expectedSalaryMaxPaise'] = maxPaise;
    if (_noticeDays != null) body['noticePeriodDays'] = _noticeDays;
    // Written whenever the list was genuinely read first — including when the
    // user has emptied it, which the old `isNotEmpty` guard made impossible to
    // save. Still never written on a failed load: `[]` would erase preferences
    // the user still has.
    if (_citiesLoaded) {
      body['preferredCityIds'] = [for (final c in _cities) c.id];
    }
    if (_gender != null) body['gender'] = _gender;

    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final repo = await ref.read(onboardingRepositoryProvider.future);
      await repo.patchProfile(body);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = e is OnboardingException ? e.message : 'Could not save. Please try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Edit profile')),
      body: SafeArea(
        child: _loading
            ? const Center(child: CqLoader(message: 'Loading your profile…'))
            : _loadError != null
                ? _LoadError(message: _loadError!, onRetry: _load)
                : _form(),
      ),
    );
  }

  Widget _form() {
    final cq = context.cq;
    final experienced = _workStatus == 'EXPERIENCED';
    return LoadingOverlay(
      loading: _saving,
      message: 'Saving…',
      child: ListView(
        padding: const EdgeInsets.all(AppSpacing.xl2),
        children: [
          if (_error != null) ...[
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(AppSpacing.md),
              decoration: BoxDecoration(
                color: cq.danger.withValues(alpha: 0.08),
                border: Border.all(color: cq.danger.withValues(alpha: 0.35)),
                borderRadius: BorderRadius.circular(AppRadius.md),
              ),
              child: Text(_error!),
            ),
            const SizedBox(height: AppSpacing.lg),
          ],

          _sectionTitle('Basic details'),
          _field('Full name', TextField(controller: _name, textCapitalization: TextCapitalization.words)),
          _field('Phone', TextField(controller: _phone, keyboardType: TextInputType.phone)),
          _field('Headline', TextField(controller: _headline, textCapitalization: TextCapitalization.sentences, decoration: const InputDecoration(hintText: 'e.g. Senior Flutter Developer'))),
          _field('About you', TextField(controller: _summary, minLines: 3, maxLines: 6, maxLength: 5000, textCapitalization: TextCapitalization.sentences, decoration: const InputDecoration(hintText: 'A short summary recruiters will read.', alignLabelWithHint: true))),

          const SizedBox(height: AppSpacing.lg),
          _sectionTitle('Work'),
          _field('Work status', _segmented(
            options: const {'FRESHER': 'Fresher', 'EXPERIENCED': 'Experienced'},
            value: _workStatus,
            onChanged: (v) => setState(() => _workStatus = v),
          )),
          _field('Looking for', _dropdown<String>(
            value: _lookingFor,
            hint: 'Select',
            items: const {'JOB': 'Job', 'INTERNSHIP': 'Internship', 'BOTH': 'Both'},
            onChanged: (v) => setState(() => _lookingFor = v),
          )),
          if (experienced) ...[
            _field('Experience', Row(children: [
              Expanded(child: _intDropdown(value: _expYears, count: 41, suffix: 'yr', onChanged: (v) => setState(() => _expYears = v))),
              const SizedBox(width: AppSpacing.md),
              Expanded(child: _intDropdown(value: _expMonths, count: 12, suffix: 'mo', onChanged: (v) => setState(() => _expMonths = v))),
            ])),
            _field('Current title', TextField(controller: _currentTitle, textCapitalization: TextCapitalization.words)),
            _field('Current company', TextField(controller: _currentCompany, textCapitalization: TextCapitalization.words)),
          ],
          _field('Current city', TextField(controller: _currentCity, textCapitalization: TextCapitalization.words)),
          _field('Industry', _pickerField(_industry?.name ?? 'Any industry', _pickIndustry)),

          const SizedBox(height: AppSpacing.lg),
          _sectionTitle('Preferences'),
          _field('Expected salary (LPA)', Row(children: [
            Expanded(child: _salaryDropdown(_expMinLpa, 'Min', (v) => setState(() => _expMinLpa = v))),
            const SizedBox(width: AppSpacing.md),
            Expanded(child: _salaryDropdown(_expMaxLpa, 'Max', (v) => setState(() => _expMaxLpa = v))),
          ])),
          _field('Notice period', _dropdown<int>(
            value: _noticeDays,
            hint: 'Not set',
            items: {
              0: 'Immediately',
              15: '15 days',
              30: '30 days',
              60: '60 days',
              90: '90 days',
              if (_noticeDays != null && !const [0, 15, 30, 60, 90].contains(_noticeDays))
                _noticeDays!: '$_noticeDays days',
            },
            onChanged: (v) => setState(() => _noticeDays = v),
          )),
          _field('Preferred cities', _pickerField(
            _cities.isEmpty ? 'Any location' : _cities.map((c) => c.name).join(', '),
            _pickCities,
          )),
          _field('Gender', _dropdown<String>(
            value: _gender,
            hint: 'Prefer not to say',
            items: const {'MALE': 'Male', 'FEMALE': 'Female', 'PREFER_NOT_TO_SAY': 'Prefer not to say'},
            onChanged: (v) => setState(() => _gender = v),
          )),

          const SizedBox(height: AppSpacing.xl),
          CqPrimaryButton(label: 'Save changes', icon: Icons.check_rounded, loading: _saving, onPressed: _save),
        ],
      ),
    );
  }

  Widget _sectionTitle(String s) => Padding(
    padding: const EdgeInsets.only(bottom: AppSpacing.md),
    child: Text(s, style: Theme.of(context).textTheme.titleMedium),
  );

  Widget _field(String label, Widget child) => Padding(
    padding: const EdgeInsets.only(bottom: AppSpacing.md),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.xs),
          child: Text(label, style: Theme.of(context).textTheme.labelMedium?.copyWith(color: context.cq.fgMuted)),
        ),
        child,
      ],
    ),
  );

  Widget _dropdown<T>({
    required T? value,
    required String hint,
    required Map<T, String> items,
    required ValueChanged<T?> onChanged,
  }) {
    return DropdownButtonFormField<T>(
      initialValue: value,
      isExpanded: true,
      decoration: const InputDecoration(),
      hint: Text(hint),
      items: [
        for (final e in items.entries) DropdownMenuItem(value: e.key, child: Text(e.value)),
      ],
      onChanged: onChanged,
    );
  }

  Widget _intDropdown({required int value, required int count, required String suffix, required ValueChanged<int> onChanged}) {
    return DropdownButtonFormField<int>(
      initialValue: value,
      isExpanded: true,
      items: [for (var i = 0; i < count; i++) DropdownMenuItem(value: i, child: Text('$i $suffix'))],
      onChanged: (v) => v == null ? null : onChanged(v),
    );
  }

  Widget _salaryDropdown(int? value, String label, ValueChanged<int?> onChanged) {
    final opts = <int>{?value, ...salaryLpaOptions}.toList()..sort();
    return DropdownButtonFormField<int?>(
      initialValue: value,
      isExpanded: true,
      decoration: InputDecoration(labelText: label),
      items: [
        const DropdownMenuItem(value: null, child: Text('Any')),
        for (final l in opts) DropdownMenuItem(value: l, child: Text('$l')),
      ],
      onChanged: onChanged,
    );
  }

  Widget _segmented({required Map<String, String> options, required String value, required ValueChanged<String> onChanged}) {
    final cq = context.cq;
    return Row(
      children: [
        for (final e in options.entries) ...[
          Expanded(
            child: Material(
              color: value == e.key ? cq.accent : cq.surfaceMuted,
              borderRadius: BorderRadius.circular(AppRadius.md),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: () => onChanged(e.key),
                child: Container(
                  height: 46,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(AppRadius.md),
                    border: Border.all(color: value == e.key ? cq.accent : cq.border),
                  ),
                  child: Text(e.value, style: TextStyle(color: value == e.key ? cq.onAccent : cq.fg, fontWeight: FontWeight.w600)),
                ),
              ),
            ),
          ),
          if (e.key != options.keys.last) const SizedBox(width: AppSpacing.md),
        ],
      ],
    );
  }

  Widget _pickerField(String text, VoidCallback onTap) {
    final cq = context.cq;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppRadius.md),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: 14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(AppRadius.md),
          border: Border.all(color: cq.border),
        ),
        child: Row(
          children: [
            Expanded(child: Text(text, maxLines: 1, overflow: TextOverflow.ellipsis)),
            Icon(Icons.chevron_right_rounded, color: cq.fgSubtle),
          ],
        ),
      ),
    );
  }
}

class _LoadError extends StatelessWidget {
  const _LoadError({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl2),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_off_rounded, size: 40, color: context.cq.fgSubtle),
            const SizedBox(height: AppSpacing.lg),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: AppSpacing.lg),
            OutlinedButton(onPressed: onRetry, child: const Text('Try again')),
          ],
        ),
      ),
    );
  }
}
