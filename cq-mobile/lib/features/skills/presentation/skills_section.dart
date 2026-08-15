import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../catalogs/data/catalog_models.dart';
import '../../catalogs/presentation/catalog_picker.dart';
import '../data/skills_repository.dart';

/// Open the skills picker and persist the result — the same flow as the
/// section's own "Add skills" button, exposed so the profile "Next steps"
/// checklist can start it without the section being on screen.
///
/// Loads the current set first and passes it as the picker's initial selection,
/// because `PATCH /me/skills` is a full-set REPLACE: saving the picker's result
/// without seeding it would silently wipe skills the candidate already has.
///
/// Returns true if anything was saved.
Future<bool> addSkillsFlow(BuildContext context, WidgetRef ref) async {
  try {
    final repo = await ref.read(skillsRepositoryProvider.future);
    final current = await repo.current();
    if (!context.mounted) return false;
    final picked = await showCatalogPicker(
      context: context,
      kind: CatalogKind.skills,
      title: 'Add skills',
      multi: true,
      initial: current,
    );
    if (picked == null || picked.isEmpty) return false;
    await repo.save(
      skillIds: [for (final c in picked) if (c.id > 0) c.id],
      customSkills: [for (final c in picked) if (c.id <= 0) c.name],
    );
    return true;
  } catch (e) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            e is SkillsException ? e.message : 'Could not save skills.',
          ),
        ),
      );
    }
    return false;
  }
}

/// Profile card: the candidate's skills. Chips are removable; "Add skills" opens
/// the catalog picker (multi) and a free-text field adds custom skills. Every
/// change persists as a full-set replace via `PATCH /me/skills`.
class SkillsSection extends ConsumerStatefulWidget {
  const SkillsSection({super.key});

  @override
  ConsumerState<SkillsSection> createState() => _SkillsSectionState();
}

class _SkillsSectionState extends ConsumerState<SkillsSection> {
  List<CatalogItem> _skills = const [];
  final _custom = TextEditingController();
  bool _loading = true;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _custom.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final repo = await ref.read(skillsRepositoryProvider.future);
      final items = await repo.current();
      if (!mounted) return;
      setState(() {
        _skills = items;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e is SkillsException ? e.message : 'Could not load your skills.';
        _loading = false;
      });
    }
  }

  /// Persist a full-set replace: positive ids as skillIds; any demo-only custom
  /// entries (negative ids) are re-sent by name so they survive.
  Future<void> _persist(List<CatalogItem> catalog, {List<String> custom = const []}) async {
    final ids = [for (final c in catalog) if (c.id > 0) c.id];
    final demoCustoms = [for (final c in catalog) if (c.id <= 0) c.name];
    setState(() => _saving = true);
    try {
      final repo = await ref.read(skillsRepositoryProvider.future);
      await repo.save(skillIds: ids, customSkills: [...demoCustoms, ...custom]);
      if (!mounted) return;
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e is SkillsException ? e.message : 'Could not save skills.')),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _openPicker() async {
    final result = await showCatalogPicker(
      context: context,
      kind: CatalogKind.skills,
      title: 'Add skills',
      multi: true,
      initial: _skills,
    );
    if (result != null) await _persist(result);
  }

  Future<void> _addCustom() async {
    final name = _custom.text.trim();
    if (name.isEmpty) return;
    final dup = _skills.any((s) => s.name.toLowerCase() == name.toLowerCase());
    _custom.clear();
    if (dup) return;
    await _persist(_skills, custom: [name]);
  }

  void _remove(CatalogItem item) {
    final next = [..._skills]..removeWhere((s) => s.id == item.id);
    _persist(next);
  }

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;

    return Container(
      decoration: BoxDecoration(
        color: cq.surfaceMuted,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: cq.border),
      ),
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.bolt_outlined, size: 18, color: cq.fgMuted),
              const SizedBox(width: AppSpacing.sm),
              Text('Skills', style: text.titleSmall),
              const Spacer(),
              if (_saving)
                const SizedBox(
                  height: 16,
                  width: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: AppSpacing.md),
              child: Center(
                child: SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            )
          else if (_error != null)
            _inlineError(_error!)
          else ...[
            if (_skills.isEmpty)
              Text(
                'Add the skills that describe your work.',
                style: text.bodyMedium?.copyWith(color: cq.fgMuted),
              )
            else
              Wrap(
                spacing: AppSpacing.sm,
                runSpacing: AppSpacing.xs,
                children: [
                  for (final s in _skills)
                    InputChip(
                      label: Text(s.name),
                      onDeleted: _saving ? null : () => _remove(s),
                    ),
                ],
              ),
            const SizedBox(height: AppSpacing.md),
            OutlinedButton.icon(
              onPressed: _saving ? null : _openPicker,
              icon: const Icon(Icons.add_rounded, size: 18),
              label: const Text('Add skills'),
            ),
            const SizedBox(height: AppSpacing.sm),
            TextField(
              controller: _custom,
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => _addCustom(),
              decoration: InputDecoration(
                hintText: 'Or type a custom skill',
                suffixIcon: IconButton(
                  icon: const Icon(Icons.add_rounded),
                  onPressed: _saving ? null : _addCustom,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _inlineError(String message) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    return Row(
      children: [
        Expanded(child: Text(message, style: text.bodySmall?.copyWith(color: cq.fgMuted))),
        TextButton(onPressed: _load, child: const Text('Retry')),
      ],
    );
  }
}
