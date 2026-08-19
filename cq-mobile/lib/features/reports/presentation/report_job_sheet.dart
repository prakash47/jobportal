import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/cq_buttons.dart';
import '../data/reports_repository.dart';

/// Report a job posting. Mirrors the control the website ships on `/job/[slug]`.
///
/// Deliberately reachable without signing in — the job page is public, and the
/// people most likely to spot a scam posting are the ones just browsing.
Future<void> showReportJobSheet(
  BuildContext context,
  WidgetRef ref, {
  required int jobId,
  required String jobTitle,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Theme.of(context).scaffoldBackgroundColor,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => _ReportJobSheet(jobId: jobId, jobTitle: jobTitle),
  );
}

class _ReportJobSheet extends ConsumerStatefulWidget {
  const _ReportJobSheet({required this.jobId, required this.jobTitle});

  final int jobId;
  final String jobTitle;

  @override
  ConsumerState<_ReportJobSheet> createState() => _ReportJobSheetState();
}

class _ReportJobSheetState extends ConsumerState<_ReportJobSheet> {
  ReportReason? _reason;
  final _details = TextEditingController();
  bool _sending = false;
  String? _error;
  bool _sent = false;

  @override
  void dispose() {
    _details.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final reason = _reason;
    if (reason == null || _sending) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final repo = await ref.read(reportsRepositoryProvider.future);
      await repo.reportJob(
        jobId: widget.jobId,
        reason: reason,
        details: _details.text,
      );
      if (!mounted) return;
      setState(() {
        _sending = false;
        _sent = true;
      });
    } catch (e) {
      if (!mounted) return;
      // An "already reported" refusal is not a failure from the reporter's
      // point of view — they did the right thing and it landed the first time.
      if (e is ReportsException && e.alreadyReported) {
        setState(() {
          _sending = false;
          _sent = true;
        });
        return;
      }
      setState(() {
        _sending = false;
        _error = e is ReportsException ? e.message : 'Could not send that.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;

    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppSpacing.xl2,
        AppSpacing.xl,
        AppSpacing.xl2,
        AppSpacing.xl + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: _sent ? _thanks(context) : _form(context, cq, text),
    );
  }

  Widget _thanks(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.check_circle_rounded, size: 40, color: cq.success),
        const SizedBox(height: AppSpacing.lg),
        Text('Thanks for telling us', style: text.titleLarge),
        const SizedBox(height: AppSpacing.sm),
        Text(
          'Our team reviews every report. We will not tell the employer who '
          'reported them.',
          textAlign: TextAlign.center,
          style: text.bodyMedium?.copyWith(color: cq.fgMuted),
        ),
        const SizedBox(height: AppSpacing.xl),
        CqPrimaryButton(
          label: 'Done',
          onPressed: () => Navigator.pop(context),
        ),
      ],
    );
  }

  Widget _form(BuildContext context, CqColors cq, TextTheme text) {
    return SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Report this job', style: text.titleLarge),
          const SizedBox(height: AppSpacing.xs),
          Text(
            widget.jobTitle,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: text.bodyMedium?.copyWith(color: cq.fgMuted),
          ),
          const SizedBox(height: AppSpacing.lg),
          Text('What is wrong with it?', style: text.titleSmall),
          const SizedBox(height: AppSpacing.sm),

          // RadioGroup owns the selection; the tiles just declare their value.
          // (groupValue/onChanged per-tile is deprecated in this Flutter.)
          IgnorePointer(
            // While the report is in flight the choice is locked — RadioGroup's
            // onChanged is non-nullable, so this is how the group is disabled.
            ignoring: _sending,
            child: RadioGroup<ReportReason>(
              groupValue: _reason,
              onChanged: (v) => setState(() => _reason = v),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (final reason in ReportReason.values)
                    RadioListTile<ReportReason>(
                      value: reason,
                      title: Text(reason.label, style: text.bodyLarge),
                      contentPadding: EdgeInsets.zero,
                      dense: true,
                    ),
                ],
              ),
            ),
          ),

          const SizedBox(height: AppSpacing.md),
          Text('Anything else? (optional)', style: text.titleSmall),
          const SizedBox(height: AppSpacing.sm),
          TextField(
            controller: _details,
            maxLines: 3,
            maxLength: 2000,
            enabled: !_sending,
            decoration: const InputDecoration(
              hintText: 'What made you report this?',
            ),
          ),

          if (_error != null) ...[
            const SizedBox(height: AppSpacing.sm),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.error_outline_rounded, size: 17, color: cq.danger),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    _error!,
                    style: text.bodySmall?.copyWith(color: cq.danger),
                  ),
                ),
              ],
            ),
          ],

          const SizedBox(height: AppSpacing.lg),
          CqPrimaryButton(
            label: 'Send report',
            loading: _sending,
            // Disabled until a reason is chosen — the server requires one.
            onPressed: _reason == null ? null : _submit,
          ),
        ],
      ),
    );
  }
}
