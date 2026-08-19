import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/cq_buttons.dart';
import '../data/project_models.dart';
import '../data/projects_repository.dart';

/// Add or edit one portfolio project. Returns true if it was saved.
Future<bool?> showProjectEditor(BuildContext context, {ProjectItem? existing}) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Theme.of(context).scaffoldBackgroundColor,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.lg)),
    ),
    builder: (_) => _ProjectEditor(existing: existing),
  );
}

class _ProjectEditor extends ConsumerStatefulWidget {
  const _ProjectEditor({this.existing});
  final ProjectItem? existing;

  @override
  ConsumerState<_ProjectEditor> createState() => _ProjectEditorState();
}

class _ProjectEditorState extends ConsumerState<_ProjectEditor> {
  late final TextEditingController _title;
  late final TextEditingController _desc;
  late final TextEditingController _url;
  final _tech = TextEditingController();
  late final List<String> _stack;

  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    _title = TextEditingController(text: e?.title ?? '');
    _desc = TextEditingController(text: e?.description ?? '');
    _url = TextEditingController(text: e?.url ?? '');
    _stack = [...?e?.techStack];
  }

  @override
  void dispose() {
    _title.dispose();
    _desc.dispose();
    _url.dispose();
    _tech.dispose();
    super.dispose();
  }

  void _addTech([String? raw]) {
    final v = (raw ?? _tech.text).trim();
    if (v.isEmpty) return;
    if (v.length > 40) {
      setState(() => _error = 'Each tech tag must be 40 characters or less.');
      return;
    }
    if (_stack.length >= 30) return;
    if (!_stack.any((s) => s.toLowerCase() == v.toLowerCase())) {
      setState(() => _stack.add(v));
    }
    _tech.clear();
  }

  Future<void> _save() async {
    final title = _title.text.trim();
    final desc = _desc.text.trim();
    var url = _url.text.trim();

    if (title.isEmpty) {
      setState(() => _error = 'A project title is required.');
      return;
    }
    if (url.isNotEmpty) {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://$url';
      }
      final uri = Uri.tryParse(url);
      if (uri == null || !uri.hasAuthority) {
        setState(() => _error = 'Enter a valid link (https://…).');
        return;
      }
    }

    final body = <String, dynamic>{
      'title': title,
      if (desc.isNotEmpty) 'description': desc,
      'techStack': _stack,
      if (url.isNotEmpty) 'url': url,
    };

    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final repo = await ref.read(projectsRepositoryProvider.future);
      final existing = widget.existing;
      if (existing != null) {
        await repo.replace(existing, body);
      } else {
        await repo.create(body);
      }
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = e is ProjectsException ? e.message : 'Could not save. Please try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    final editing = widget.existing != null;

    return Padding(
      padding: EdgeInsets.only(
        left: AppSpacing.xl2,
        right: AppSpacing.xl2,
        top: AppSpacing.lg,
        bottom: MediaQuery.of(context).viewInsets.bottom + AppSpacing.xl2,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: AppSpacing.lg),
                decoration: BoxDecoration(
                  color: cq.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Text(editing ? 'Edit project' : 'Add project', style: text.titleLarge),
            const SizedBox(height: AppSpacing.lg),

            _label('Title'),
            TextField(
              controller: _title,
              textCapitalization: TextCapitalization.sentences,
              maxLength: 150,
              decoration: const InputDecoration(
                hintText: 'e.g. CQ Mobile — Job app',
                counterText: '',
              ),
            ),
            const SizedBox(height: AppSpacing.md),

            _label('Description (optional)'),
            TextField(
              controller: _desc,
              minLines: 3,
              maxLines: 6,
              maxLength: 2000,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                hintText: 'What is it? Your role, the problem it solves, the impact…',
                alignLabelWithHint: true,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),

            _label('Tech stack (optional)'),
            if (_stack.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                child: Wrap(
                  spacing: AppSpacing.sm,
                  runSpacing: AppSpacing.xs,
                  children: [
                    for (final t in _stack)
                      InputChip(
                        label: Text(t),
                        onDeleted: () => setState(() => _stack.remove(t)),
                      ),
                  ],
                ),
              ),
            TextField(
              controller: _tech,
              textInputAction: TextInputAction.done,
              onSubmitted: _addTech,
              decoration: InputDecoration(
                hintText: 'Add a tag, e.g. Flutter',
                suffixIcon: IconButton(
                  icon: const Icon(Icons.add_rounded),
                  onPressed: _addTech,
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.md),

            _label('Link (optional)'),
            TextField(
              controller: _url,
              keyboardType: TextInputType.url,
              autocorrect: false,
              decoration: const InputDecoration(hintText: 'https://github.com/…'),
            ),

            if (_error != null) ...[
              const SizedBox(height: AppSpacing.sm),
              Text(_error!, style: text.bodySmall?.copyWith(color: cq.danger)),
            ],
            const SizedBox(height: AppSpacing.lg),

            CqPrimaryButton(
              label: editing ? 'Save changes' : 'Add project',
              icon: Icons.check_rounded,
              loading: _saving,
              onPressed: _save,
            ),
          ],
        ),
      ),
    );
  }

  Widget _label(String s) => Padding(
    padding: const EdgeInsets.only(bottom: AppSpacing.xs),
    child: Text(
      s,
      style: Theme.of(context).textTheme.labelMedium?.copyWith(color: context.cq.fgMuted),
    ),
  );
}
