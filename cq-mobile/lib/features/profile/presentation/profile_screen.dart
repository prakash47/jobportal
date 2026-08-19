import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../shell/presentation/app_drawer.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/cq_buttons.dart';
import '../../../shared/widgets/cq_loader.dart';
import '../../../shared/widgets/theme_toggle_button.dart';
import '../../auth/application/auth_controller.dart';
import '../../education/presentation/education_editor_sheet.dart';
import '../../education/presentation/education_section.dart';
import '../../experience/presentation/experience_editor_sheet.dart';
import '../../experience/presentation/experience_section.dart';
import '../../languages/presentation/languages_section.dart';
import '../../projects/presentation/projects_section.dart';
import '../../resume/presentation/resume_section.dart';
import '../../skills/presentation/skills_section.dart';
import '../data/profile_overview.dart';
import '../data/profile_repository.dart';
import 'profile_details_editor_screen.dart';
import '../../auth/presentation/verify_email_sheet.dart';
import '../../../core/format/job_format.dart';
import '../../../shared/widgets/cq_states.dart';

String _expLabel(int? months) {
  final m = months ?? 0;
  if (m == 0) return 'Fresher';
  final y = m ~/ 12;
  final rem = m % 12;
  final parts = <String>[];
  if (y > 0) parts.add('$y yr${y > 1 ? 's' : ''}');
  if (rem > 0) parts.add('$rem mo');
  return parts.isEmpty ? 'Fresher' : parts.join(' ');
}

String _pretty(String? s) {
  if (s == null || s.isEmpty) return '';
  return s
      .toLowerCase()
      .split('_')
      .map((w) => w.isEmpty ? w : w[0].toUpperCase() + w.substring(1))
      .join(' ');
}

/// Profile tab — read overview of the seeker's profile (`/me/profile`) with a
/// completeness bar, an entry to the edit wizard, and logout. Section-level
/// editing lives in the onboarding/profile wizard.
class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  ProfileOverview? _profile;
  bool _loading = true;
  String? _error;

  /// Bumped when a "Next steps" shortcut saves something, to remount the
  /// section cards below so they refetch. They own their state and load once on
  /// mount, so without this an item added from the checklist would not appear
  /// in its own section until the tab was rebuilt.
  int _sectionsToken = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final repo = await ref.read(profileRepositoryProvider.future);
      final data = await repo.load();
      if (!mounted) return;
      setState(() {
        _profile = data;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e is ProfileException ? e.message : 'Could not load your profile.';
        _loading = false;
      });
    }
  }

  Future<void> _edit() async {
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const ProfileDetailsEditorScreen()),
    );
    if (mounted && saved == true) _load(); // refresh after editing
  }

  Future<void> _verifyEmail(String email) async {
    final verified = await showVerifyEmailSheet(context, ref, email: email);
    if (verified && mounted) _load();
  }

  /// Run a checklist shortcut that may have saved something, then refresh the
  /// completeness figure and the affected section card.
  Future<void> _afterShortcut(Future<bool?> action) async {
    final saved = await action;
    if (!mounted || saved != true) return;
    setState(() => _sectionsToken++);
    await _load();
  }

  /// What's still missing, most-valuable first. Each entry opens the editor
  /// that fixes it directly — scrolling to the section below would be the
  /// obvious alternative, but those cards are inside a lazily-built list and
  /// may not exist yet when the shortcut is tapped, which would make the tap
  /// silently do nothing. An empty list hides the block: a checklist that stays
  /// visible after you finish it is just nagging.
  List<_NextStep> _nextSteps(ProfileOverview p) => [
    if ((p.headline ?? '').isEmpty)
      _NextStep('Add a headline', 'Recruiters see it first', _edit),
    if (p.skillCount == 0)
      _NextStep(
        'Add your skills',
        'They drive your job matches',
        () => _afterShortcut(addSkillsFlow(context, ref)),
      ),
    if (p.experienceCount == 0 && p.workStatus == 'EXPERIENCED')
      _NextStep(
        'Add work experience',
        'Your roles and what you did',
        () => _afterShortcut(showExperienceEditor(context)),
      ),
    if (p.educationCount == 0)
      _NextStep(
        'Add your education',
        'Degree, college and year',
        () => _afterShortcut(showEducationEditor(context)),
      ),
    if (p.lookingFor == null)
      _NextStep('Set what you\'re looking for', 'Job, internship or both', _edit),
    if (p.expectedSalaryMinPaise == null)
      _NextStep('Add expected salary', 'Filters out mismatched roles', _edit),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      drawer: const AppDrawer(),
      appBar: AppBar(
        title: const Text('Profile'),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            tooltip: 'Settings',
            onPressed: () => context.push(AppRoutes.settings),
          ),
          const ThemeToggleButton(),
          const SizedBox(width: AppSpacing.sm),
        ],
      ),
      body: SafeArea(child: _body()),
    );
  }

  Widget _body() {
    if (_loading) {
      return const Center(child: CqLoader(message: 'Loading your profile…'));
    }
    if (_error != null) {
      return CqErrorView(message: _error!, onRetry: _load);
    }
    final p = _profile!;
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    final steps = _nextSteps(p);

    final rows = <(IconData, String, String)>[
      (Icons.badge_outlined, 'Headline', p.headline ?? 'Not added'),
      (
        Icons.work_outline_rounded,
        'Work status',
        p.workStatus != null ? _pretty(p.workStatus) : 'Not set',
      ),
      if (p.workStatus == 'EXPERIENCED')
        (Icons.timeline_rounded, 'Total experience', _expLabel(p.experienceMonths)),
      if ((p.currentTitle ?? '').isNotEmpty)
        (
          Icons.business_center_outlined,
          'Current role',
          [p.currentTitle, if ((p.currentCompanyName ?? '').isNotEmpty) 'at ${p.currentCompanyName}']
              .whereType<String>()
              .join(' '),
        ),
      if ((p.currentCityName ?? '').isNotEmpty)
        (Icons.location_on_outlined, 'City', p.currentCityName!),
      if (p.lookingFor != null)
        (Icons.search_rounded, 'Looking for', _pretty(p.lookingFor)),
      // Uses the app's own paise→LPA formatter. This row used to divide paise by
      // 100 by hand and print "₹1200000 / year", and it ignored the maximum the
      // candidate had entered in the editor.
      if (p.expectedSalaryMinPaise != null || p.expectedSalaryMaxPaise != null)
        (
          Icons.currency_rupee_rounded,
          'Expected salary',
          formatSalaryLpa(p.expectedSalaryMinPaise, p.expectedSalaryMaxPaise) ??
              'Not set',
        ),
      (Icons.bolt_outlined, 'Skills', '${p.skillCount} added'),
      (Icons.school_outlined, 'Education', '${p.educationCount} added'),
      (Icons.article_outlined, 'Work history', '${p.experienceCount} added'),
    ];

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(AppSpacing.xl2),
        children: [
          // ── Header ──
          Row(
            children: [
              CircleAvatar(
                radius: 30,
                backgroundColor: cq.accent.withValues(alpha: 0.16),
                child: Text(
                  p.name.trim().isNotEmpty ? p.name.trim()[0].toUpperCase() : '?',
                  style: text.headlineMedium?.copyWith(color: cq.accent),
                ),
              ),
              const SizedBox(width: AppSpacing.lg),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(p.name.isEmpty ? 'Your account' : p.name, style: text.titleLarge),
                    const SizedBox(height: 2),
                    Text(
                      p.email,
                      style: text.bodyMedium?.copyWith(color: cq.fgMuted),
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    // Unverified is a state the user can ACT on, so the badge
                    // is a button in that case. Before, it stated the problem
                    // and offered nothing — and an unverified address blocks
                    // applying entirely.
                    if (p.emailVerified)
                      Row(
                        children: [
                          Icon(
                            Icons.verified_rounded,
                            size: 15,
                            color: cq.success,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            'Email verified',
                            style: text.labelSmall?.copyWith(color: cq.success),
                          ),
                        ],
                      )
                    else
                      InkWell(
                        onTap: () => _verifyEmail(p.email),
                        borderRadius: BorderRadius.circular(AppRadius.sm),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 2),
                          child: Row(
                            children: [
                              Icon(
                                Icons.error_outline_rounded,
                                size: 15,
                                color: cq.warning,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                'Email not verified',
                                style: text.labelSmall?.copyWith(
                                  color: cq.warning,
                                ),
                              ),
                              const SizedBox(width: 6),
                              Text(
                                'Verify',
                                style: text.labelSmall?.copyWith(
                                  color: cq.accent,
                                  fontWeight: FontWeight.w700,
                                  decoration: TextDecoration.underline,
                                  decorationColor: cq.accent,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.xl),

          // ── Completeness ──
          Container(
            padding: const EdgeInsets.all(AppSpacing.lg),
            decoration: BoxDecoration(
              color: cq.surfaceMuted,
              borderRadius: BorderRadius.circular(AppRadius.md),
              border: Border.all(color: cq.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Profile completeness', style: text.titleSmall),
                    Text(
                      '${p.completeness}%',
                      style: text.titleSmall?.copyWith(color: cq.accent),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.sm),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: (p.completeness / 100).clamp(0.0, 1.0),
                    minHeight: 8,
                    backgroundColor: cq.border,
                    valueColor: AlwaysStoppedAnimation<Color>(cq.accent),
                  ),
                ),

                // ── Next steps ──
                if (steps.isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.lg),
                  Text(
                    'Next steps',
                    style: text.labelLarge?.copyWith(color: cq.fgMuted),
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  // Capped at three: a wall of to-dos reads as failure, three
                  // reads as a nudge. The rest surface as these get done.
                  for (final s in steps.take(3)) _NextStepTile(step: s),
                ],
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.lg),

          CqPrimaryButton(
            label: 'Edit profile',
            icon: Icons.tune_rounded,
            showArrow: true,
            onPressed: _edit,
          ),
          const SizedBox(height: AppSpacing.xl),

          // ── Resume ──
          const ResumeCard(),
          const SizedBox(height: AppSpacing.xl),

          // ── Work experience ──
          KeyedSubtree(
            key: ValueKey('experience-$_sectionsToken'),
            child: const WorkExperienceSection(),
          ),
          const SizedBox(height: AppSpacing.xl),

          // ── Skills ──
          KeyedSubtree(
            key: ValueKey('skills-$_sectionsToken'),
            child: const SkillsSection(),
          ),
          const SizedBox(height: AppSpacing.xl),

          // ── Projects ──
          const ProjectsSection(),
          const SizedBox(height: AppSpacing.xl),

          // ── Languages ──
          const LanguagesSection(),
          const SizedBox(height: AppSpacing.xl),

          // ── Education ──
          KeyedSubtree(
            key: ValueKey('education-$_sectionsToken'),
            child: const EducationSection(),
          ),
          const SizedBox(height: AppSpacing.xl),

          // ── Details ──
          Text('Your details', style: text.titleMedium),
          const SizedBox(height: AppSpacing.md),
          Container(
            decoration: BoxDecoration(
              color: cq.surfaceMuted,
              borderRadius: BorderRadius.circular(AppRadius.md),
              border: Border.all(color: cq.border),
            ),
            child: Column(
              children: [
                for (var i = 0; i < rows.length; i++) ...[
                  _InfoTile(icon: rows[i].$1, label: rows[i].$2, value: rows[i].$3),
                  if (i < rows.length - 1)
                    Divider(height: 1, color: cq.border, indent: 52),
                ],
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.xl),

          OutlinedButton.icon(
            onPressed: () =>
                ref.read(authControllerProvider.notifier).logout(),
            icon: const Icon(Icons.logout_rounded, size: 18),
            label: const Text('Log out'),
          ),
        ],
      ),
    );
  }
}

/// One outstanding profile item and the action that completes it.
class _NextStep {
  const _NextStep(this.title, this.hint, this.onTap);
  final String title;
  final String hint;
  final VoidCallback onTap;
}

class _NextStepTile extends StatelessWidget {
  const _NextStepTile({required this.step});
  final _NextStep step;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    return InkWell(
      onTap: step.onTap,
      borderRadius: BorderRadius.circular(AppRadius.sm),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
        child: Row(
          children: [
            Icon(Icons.radio_button_unchecked_rounded, size: 17, color: cq.accent),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(step.title, style: text.bodyMedium),
                  Text(
                    step.hint,
                    style: text.labelSmall?.copyWith(color: cq.fgSubtle),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, size: 18, color: cq.fgSubtle),
          ],
        ),
      ),
    );
  }
}

class _InfoTile extends StatelessWidget {
  const _InfoTile({required this.icon, required this.label, required this.value});
  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: AppSpacing.md,
      ),
      child: Row(
        children: [
          Icon(icon, size: 20, color: cq.fgMuted),
          const SizedBox(width: AppSpacing.md),
          Text(label, style: text.bodyMedium?.copyWith(color: cq.fgMuted)),
          const Spacer(),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}

