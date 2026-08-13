import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/cq_loader.dart';
import '../data/catalog_models.dart';
import '../data/catalogs_repository.dart';

/// Opens a searchable catalog picker (skills / cities / industries) as a modal
/// bottom sheet. Returns the chosen items, or null if dismissed.
///
/// [multi] true → tick multiple + "Done"; false → tap one and it returns.
Future<List<CatalogItem>?> showCatalogPicker({
  required BuildContext context,
  required CatalogKind kind,
  required String title,
  bool multi = false,
  List<CatalogItem> initial = const [],
}) {
  return showModalBottomSheet<List<CatalogItem>>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Theme.of(context).scaffoldBackgroundColor,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) =>
        _CatalogPickerSheet(kind: kind, title: title, multi: multi, initial: initial),
  );
}

class _CatalogPickerSheet extends ConsumerStatefulWidget {
  const _CatalogPickerSheet({
    required this.kind,
    required this.title,
    required this.multi,
    required this.initial,
  });

  final CatalogKind kind;
  final String title;
  final bool multi;
  final List<CatalogItem> initial;

  @override
  ConsumerState<_CatalogPickerSheet> createState() => _CatalogPickerSheetState();
}

class _CatalogPickerSheetState extends ConsumerState<_CatalogPickerSheet> {
  CatalogsRepository? _repo;
  final _controller = TextEditingController();
  Timer? _debounce;
  CatalogPage? _page;
  bool _loading = true;
  late final Set<CatalogItem> _selected = {...widget.initial};

  @override
  void initState() {
    super.initState();
    _load('');
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  Future<CatalogsRepository> _repository() async {
    final existing = _repo;
    if (existing != null) return existing;
    final repo = await ref.read(catalogsRepositoryProvider.future);
    _repo = repo;
    return repo;
  }

  Future<void> _load(String q) async {
    setState(() => _loading = true);
    try {
      final data = await (await _repository()).search(widget.kind, q: q);
      if (!mounted) return;
      setState(() {
        _page = data;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _page = const CatalogPage(hits: [], total: 0, page: 1, pageSize: 30);
        _loading = false;
      });
    }
  }

  void _onChanged(String q) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 260), () => _load(q));
  }

  void _tap(CatalogItem item) {
    if (!widget.multi) {
      Navigator.pop(context, [item]);
      return;
    }
    setState(() {
      _selected.contains(item) ? _selected.remove(item) : _selected.add(item);
    });
  }

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.82,
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
                AppSpacing.sm,
                AppSpacing.sm,
              ),
              child: Row(
                children: [
                  Expanded(child: Text(widget.title, style: text.titleMedium)),
                  if (widget.multi)
                    TextButton(
                      onPressed: () => Navigator.pop(context, _selected.toList()),
                      child: Text('Done (${_selected.length})'),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
              child: TextField(
                controller: _controller,
                autofocus: true,
                textInputAction: TextInputAction.search,
                onChanged: _onChanged,
                decoration: InputDecoration(
                  hintText: 'Search ${widget.kind.plural}',
                  prefixIcon: const Icon(Icons.search_rounded),
                ),
              ),
            ),
            if (widget.multi && _selected.isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.lg,
                  AppSpacing.md,
                  AppSpacing.lg,
                  0,
                ),
                child: Wrap(
                  spacing: AppSpacing.sm,
                  runSpacing: AppSpacing.xs,
                  children: [
                    for (final s in _selected)
                      InputChip(
                        label: Text(s.name),
                        onDeleted: () => setState(() => _selected.remove(s)),
                      ),
                  ],
                ),
              ),
            const SizedBox(height: AppSpacing.sm),
            Divider(height: 1, color: cq.border),
            Expanded(child: _results()),
          ],
        ),
      ),
    );
  }

  Widget _results() {
    if (_loading && _page == null) {
      return const Center(child: CqLoader(message: 'Loading…'));
    }
    final page = _page;
    if (page == null || page.hits.isEmpty) {
      return Center(
        child: Text(
          'No matches',
          style: TextStyle(color: context.cq.fgMuted),
        ),
      );
    }
    return ListView.builder(
      itemCount: page.hits.length,
      itemBuilder: (_, i) {
        final item = page.hits[i];
        final selected = _selected.contains(item);
        return ListTile(
          title: Text(item.name),
          subtitle: (item.category ?? '').isEmpty ? null : Text(item.category!),
          trailing: widget.multi
              ? Icon(
                  selected
                      ? Icons.check_circle_rounded
                      : Icons.circle_outlined,
                  color: selected ? context.cq.accent : context.cq.fgSubtle,
                )
              : null,
          onTap: () => _tap(item),
        );
      },
    );
  }
}
