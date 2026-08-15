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
import '../../experience/presentation/experience_section.dart';
import '../../languages/presentation/languages_section.dart';
import '../../projects/presentation/projects_section.dart';
import '../../resume/presentation/resume_section.dart';
import '../../skills/presentation/skills_section.dart';
import '../data/profile_overview.dart';
import '../data/profile_repository.dart';

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
    await context.push(AppRoutes.onboarding);
    if (mounted) _load(); // refresh after editing
  }

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
      return _ErrorView(message: _error!, onRetry: _load);
    }
    final p = _profile!;
    final cq = context.cq;
    final text = Theme.of(context).textTheme;

    final rows = <(IconData, String, String)>[
      (Icons.badge_outlined, 'Headline', p.headline ?? 'Not added'),
      (
        Icons.work_outline_rounded,
        'Work status',
        p.workStatus != null ? _pretty(p.workStatus) : 'Not set',
      ),
      if (p.workStatus == 'EXPERIENCED')
        (Icons.timeline_rounded, 'Experience', _expLabel(p.experienceMonths)),
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
      if (p.expectedSalaryMinPaise != null)
        (
          Icons.currency_rupee_rounded,
          'Expected salary',
          '₹${(p.expectedSalaryMinPaise! ~/ 100)} / year',
        ),
      (Icons.bolt_outlined, 'Skills', '${p.skillCount} added'),
      (Icons.school_outlined, 'Education', '${p.educationCount} added'),
      (Icons.article_outlined, 'Experience', '${p.experienceCount} added'),
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
                    Row(
                      children: [
                        Icon(
                          p.emailVerified
                              ? Icons.verified_rounded
                              : Icons.error_outline_rounded,
                          size: 15,
                          color: p.emailVerified ? cq.success : cq.warning,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          p.emailVerified ? 'Email verified' : 'Email not verified',
                          style: text.labelSmall?.copyWith(
                            color: p.emailVerified ? cq.success : cq.warning,
                          ),
                        ),
                      ],
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
          const WorkExperienceSection(),
          const SizedBox(height: AppSpacing.xl),

          // ── Skills ──
          const SkillsSection(),
          const SizedBox(height: AppSpacing.xl),

          // ── Projects ──
          const ProjectsSection(),
          const SizedBox(height: AppSpacing.xl),

          // ── Languages ──
          const LanguagesSection(),
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

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl2),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_off_rounded, size: 40, color: context.cq.fgSubtle),
            const SizedBox(height: AppSpacing.lg),
            Text(message, textAlign: TextAlign.center, style: text.bodyLarge),
            const SizedBox(height: AppSpacing.lg),
            OutlinedButton(onPressed: onRetry, child: const Text('Try again')),
          ],
        ),
      ),
    );
  }
}
