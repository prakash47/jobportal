import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/cq_buttons.dart';
import '../../catalogs/data/catalog_models.dart';
import '../../catalogs/presentation/catalog_picker.dart';
import '../data/job_filters.dart';

/// Opens the job-search filter sheet seeded with [current]; returns the edited
/// [JobFilters], or null if dismissed without applying.
Future<JobFilters?> showJobFilters(BuildContext context, JobFilters current) {
  return showModalBottomSheet<JobFilters>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Theme.of(context).scaffoldBackgroundColor,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => _JobFiltersSheet(initial: current),
  );
}

const _expYears = <int?>[null, 0, 1, 2, 3, 5, 7, 10, 15];
const _salaryLpa = <int?>[null, 3, 5, 8, 10, 15, 20, 30, 50];

class _JobFiltersSheet extends ConsumerStatefulWidget {
  const _JobFiltersSheet({required this.initial});
  final JobFilters initial;

  @override
  ConsumerState<_JobFiltersSheet> createState() => _JobFiltersSheetState();
}

class _JobFiltersSheetState extends ConsumerState<_JobFiltersSheet> {
  late List<CatalogItem> _skills = [...widget.initial.skills];
  late List<CatalogItem> _cities = [...widget.initial.cities];
  late CatalogItem? _industry = widget.initial.industry;
  late final Set<String> _emp = {...widget.initial.employmentTypes};
  late final Set<String> _modes = {...widget.initial.workModes};
  late int? _expMin = widget.initial.expMinYears;
  late int? _expMax = widget.initial.expMaxYears;
  late int? _minSalary = widget.initial.minSalaryLpa;
  late int? _postedWithin = widget.initial.postedWithin;

  Future<void> _pickMulti(CatalogKind kind, List<CatalogItem> current,
      ValueChanged<List<CatalogItem>> onDone) async {
    final r = await showCatalogPicker(
      context: context,
      kind: kind,
      title: kind == CatalogKind.skills ? 'Skills' : 'Cities',
      multi: true,
      initial: current,
    );
    if (r != null) setState(() => onDone(r));
  }

  Future<void> _pickIndustry() async {
    final r = await showCatalogPicker(
      context: context,
      kind: CatalogKind.industries,
      title: 'Industry',
      initial: _industry == null ? const [] : [_industry!],
    );
    if (r != null && r.isNotEmpty) setState(() => _industry = r.first);
  }

  void _clear() => setState(() {
    _skills = [];
    _cities = [];
    _industry = null;
    _emp.clear();
    _modes.clear();
    _expMin = null;
    _expMax = null;
    _minSalary = null;
    _postedWithin = null;
  });

  void _apply() => Navigator.pop(
    context,
    JobFilters(
      skills: _skills,
      cities: _cities,
      industry: _industry,
      employmentTypes: _emp,
      workModes: _modes,
      expMinYears: _expMin,
      expMaxYears: _expMax,
      minSalaryLpa: _minSalary,
      postedWithin: _postedWithin,
    ),
  );

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    return SizedBox(
      height: MediaQuery.of(context).size.height * 0.86,
      child: Column(
        children: [
          const SizedBox(height: AppSpacing.sm),
          Container(
            width: 38,
            height: 4,
            decoration: BoxDecoration(
              color: cq.border,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.sm,
              AppSpacing.md,
              AppSpacing.sm,
            ),
            child: Row(
              children: [
                Expanded(child: Text('Filters', style: text.titleLarge)),
                TextButton(onPressed: _clear, child: const Text('Clear all')),
              ],
            ),
          ),
          Divider(height: 1, color: cq.border),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(AppSpacing.lg),
              children: [
                _pickerSection(
                  'Skills',
                  _skills,
                  onAdd: () => _pickMulti(
                    CatalogKind.skills,
                    _skills,
                    (r) => _skills = r,
                  ),
                  onRemove: (i) => setState(() => _skills.remove(i)),
                ),
                _pickerSection(
                  'Cities',
                  _cities,
                  onAdd: () => _pickMulti(
                    CatalogKind.cities,
                    _cities,
                    (r) => _cities = r,
                  ),
                  onRemove: (i) => setState(() => _cities.remove(i)),
                ),
                _pickerSection(
                  'Industry',
                  _industry == null ? const [] : [_industry!],
                  onAdd: _pickIndustry,
                  onRemove: (_) => setState(() => _industry = null),
                  single: true,
                ),
                _section('Employment type', _chips({
                  'FULL_TIME': 'Full-time',
                  'PART_TIME': 'Part-time',
                  'CONTRACTOR': 'Contract',
                  'INTERN': 'Internship',
                }, _emp)),
                _section('Work mode', _chips({
                  'on-site': 'On-site',
                  'hybrid': 'Hybrid',
                  'remote': 'Remote',
                }, _modes)),
                _section(
                  'Experience',
                  Row(
                    children: [
                      Expanded(child: _yearsDropdown('Min', _expMin, (v) => setState(() => _expMin = v))),
                      const SizedBox(width: AppSpacing.md),
                      Expanded(child: _yearsDropdown('Max', _expMax, (v) => setState(() => _expMax = v))),
                    ],
                  ),
                ),
                _section(
                  'Minimum salary',
                  _dropdown<int?>(
                    _minSalary,
                    _salaryLpa,
                    (v) => v == null ? 'Any' : '₹$v LPA+',
                    (v) => setState(() => _minSalary = v),
                  ),
                ),
                _section('Date posted', _chips({
                  '1': 'Last 24 hours',
                  '7': 'Last 7 days',
                  '30': 'Last 30 days',
                }, _postedSet(), onToggle: (k) {
                  final v = int.parse(k);
                  setState(() => _postedWithin = _postedWithin == v ? null : v);
                })),
                const SizedBox(height: AppSpacing.sm),
              ],
            ),
          ),
          Container(
            padding: EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.md,
              AppSpacing.lg,
              AppSpacing.md + MediaQuery.of(context).padding.bottom,
            ),
            decoration: BoxDecoration(
              border: Border(top: BorderSide(color: cq.border)),
            ),
            child: CqPrimaryButton(label: 'Show results', onPressed: _apply),
          ),
        ],
      ),
    );
  }

  // ── helpers ──

  Set<String> _postedSet() => _postedWithin == null ? {} : {'$_postedWithin'};

  Widget _section(String title, Widget child) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: text.titleSmall),
          const SizedBox(height: AppSpacing.md),
          child,
        ],
      ),
    );
  }

  Widget _pickerSection(
    String title,
    List<CatalogItem> items, {
    required VoidCallback onAdd,
    required ValueChanged<CatalogItem> onRemove,
    bool single = false,
  }) {
    return _section(
      title,
      Wrap(
        spacing: AppSpacing.sm,
        runSpacing: AppSpacing.xs,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          for (final it in items)
            InputChip(label: Text(it.name), onDeleted: () => onRemove(it)),
          ActionChip(
            avatar: const Icon(Icons.add_rounded, size: 18),
            label: Text(single ? 'Select' : 'Add'),
            onPressed: onAdd,
          ),
        ],
      ),
    );
  }

  Widget _chips(Map<String, String> options, Set<String> selected,
      {ValueChanged<String>? onToggle}) {
    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.sm,
      children: [
        for (final e in options.entries)
          _ToggleChip(
            label: e.value,
            selected: selected.contains(e.key),
            onTap: () => onToggle != null
                ? onToggle(e.key)
                : setState(() => selected.contains(e.key)
                    ? selected.remove(e.key)
                    : selected.add(e.key)),
          ),
      ],
    );
  }

  Widget _yearsDropdown(String label, int? value, ValueChanged<int?> onChanged) {
    return _dropdown<int?>(
      value,
      _expYears,
      (v) => v == null ? '$label (any)' : '$v yr${v == 1 ? '' : 's'}',
      onChanged,
    );
  }

  Widget _dropdown<T>(
    T value,
    List<T> options,
    String Function(T) label,
    ValueChanged<T> onChanged,
  ) {
    final cq = context.cq;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
      decoration: BoxDecoration(
        color: cq.surfaceMuted,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: cq.border),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<T>(
          value: value,
          isExpanded: true,
          items: [
            for (final o in options)
              DropdownMenuItem<T>(value: o, child: Text(label(o))),
          ],
          onChanged: (v) => onChanged(v as T),
        ),
      ),
    );
  }
}

class _ToggleChip extends StatelessWidget {
  const _ToggleChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.sm,
        ),
        decoration: BoxDecoration(
          color: selected ? cq.accent.withValues(alpha: 0.14) : cq.surfaceMuted,
          borderRadius: BorderRadius.circular(AppRadius.pill),
          border: Border.all(
            color: selected ? cq.accent.withValues(alpha: 0.5) : cq.border,
          ),
        ),
        child: Text(
          label,
          style: Theme.of(context).textTheme.labelMedium?.copyWith(
            color: selected ? cq.accent : cq.fgMuted,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
          ),
        ),
      ),
    );
  }
}
