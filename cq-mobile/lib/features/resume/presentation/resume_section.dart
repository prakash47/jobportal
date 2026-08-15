import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/format/job_format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../data/resume_models.dart';
import '../data/resume_repository.dart';

/// Pick a PDF/DOC/DOCX and upload it as the candidate's resume. Returns the new
/// [ResumeView], or null if cancelled/failed (a snackbar explains failures).
/// Reused by the profile Resume card and the apply flow.
Future<ResumeView?> pickAndUploadResume(BuildContext context, WidgetRef ref) async {
  final messenger = ScaffoldMessenger.of(context);
  final danger = context.cq.danger;
  void err(String m) => messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(m),
        behavior: SnackBarBehavior.floating,
        backgroundColor: danger,
      ),
    );

  final picked = await FilePicker.pickFiles(
    type: FileType.custom,
    allowedExtensions: ['pdf', 'doc', 'docx'],
  );
  if (picked == null || picked.files.isEmpty) return null;
  final f = picked.files.first;
  final path = f.path;
  if (path == null) {
    err('Could not read that file.');
    return null;
  }
  if (f.size > 5 * 1024 * 1024) {
    err('That file is over 5 MB. Please pick a smaller one.');
    return null;
  }
  try {
    final repo = await ref.read(resumeRepositoryProvider.future);
    return await repo.upload(path, f.name, size: f.size);
  } catch (e) {
    err(e is ResumeException ? e.message : 'Upload failed. Please try again.');
    return null;
  }
}

/// Profile card: shows the current resume (or an upload prompt), with replace /
/// remove. A resume is required to apply.
class ResumeCard extends ConsumerStatefulWidget {
  const ResumeCard({super.key});

  @override
  ConsumerState<ResumeCard> createState() => _ResumeCardState();
}

class _ResumeCardState extends ConsumerState<ResumeCard> {
  ResumeView? _resume;
  bool _loading = true;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final repo = await ref.read(resumeRepositoryProvider.future);
      final r = await repo.getActive();
      if (!mounted) return;
      setState(() {
        _resume = r;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  Future<void> _upload() async {
    setState(() => _busy = true);
    final r = await pickAndUploadResume(context, ref);
    if (!mounted) return;
    setState(() {
      if (r != null) _resume = r;
      _busy = false;
    });
  }

  Future<void> _remove() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove resume?'),
        content: const Text(
          'You will need to upload a resume again before you can apply.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: ctx.cq.danger),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _busy = true);
    try {
      final repo = await ref.read(resumeRepositoryProvider.future);
      await repo.remove();
      if (!mounted) return;
      setState(() {
        _resume = null;
        _busy = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e is ResumeException ? e.message : 'Could not remove.')),
      );
    }
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
              Icon(Icons.description_outlined, size: 18, color: cq.fgMuted),
              const SizedBox(width: AppSpacing.sm),
              Text('Resume', style: text.titleSmall),
              const Spacer(),
              if (_resume != null && !_busy)
                TextButton(onPressed: _upload, child: const Text('Replace')),
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
          else if (_resume != null)
            _fileTile(_resume!)
          else
            _emptyPrompt(),
        ],
      ),
    );
  }

  Widget _fileTile(ResumeView r) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    return Row(
      children: [
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: cq.accent.withValues(alpha: 0.14),
            borderRadius: BorderRadius.circular(AppRadius.sm),
          ),
          child: Icon(Icons.picture_as_pdf_rounded, color: cq.accent, size: 22),
        ),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                r.originalFilename,
                style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 2),
              Text(
                r.isScanning
                    ? '${r.sizeLabel} · Checking…'
                    : '${r.sizeLabel} · Added ${formatDate(r.uploadedAt)}',
                style: text.bodySmall?.copyWith(color: cq.fgMuted),
              ),
            ],
          ),
        ),
        if (_busy)
          const SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(strokeWidth: 2),
          )
        else
          IconButton(
            tooltip: 'Remove',
            icon: Icon(Icons.delete_outline_rounded, color: cq.fgMuted),
            onPressed: _remove,
          ),
      ],
    );
  }

  Widget _emptyPrompt() {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Add your resume to apply for jobs.',
          style: text.bodyMedium?.copyWith(color: cq.fgMuted),
        ),
        const SizedBox(height: 2),
        Text(
          'PDF or Word, up to 5 MB.',
          style: text.bodySmall?.copyWith(color: cq.fgSubtle),
        ),
        const SizedBox(height: AppSpacing.md),
        OutlinedButton.icon(
          onPressed: _busy ? null : _upload,
          icon: _busy
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.upload_file_rounded, size: 18),
          label: const Text('Upload resume'),
        ),
      ],
    );
  }
}
