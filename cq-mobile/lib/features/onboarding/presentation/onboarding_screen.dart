import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/brand_logo.dart';
import '../../../shared/widgets/cq_buttons.dart';
import '../../../shared/widgets/cq_loader.dart';
import '../data/candidate_profile.dart';
import '../data/onboarding_repository.dart';
import 'steps/education_step.dart';
import 'steps/headline_step.dart';
import 'steps/work_profile_step.dart';

// (title, subtitle) for each of the 3 data steps.
const _stepMeta = [
  ('Work profile', 'Tell recruiters where you are in your career.'),
  ('Education', 'Add your most recent degree and Class 12.'),
  ('Headline & preferences', 'Round out your profile so the right roles find you.'),
];
const _dataSteps = 3;

/// Post-registration onboarding — mirrors the website's skippable 3-step wizard,
/// in the CQ theme. Loads `/me/profile` first (which provisions the Candidate
/// row), then each step saves real data. Every step is skippable, and "Skip for
/// now" jumps straight to Home; skipped details can be completed later.
class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final _workKey = GlobalKey<WorkProfileStepState>();
  final _eduKey = GlobalKey<EducationStepState>();
  final _headKey = GlobalKey<HeadlineStepState>();

  OnboardingRepository? _repo;
  CandidateProfile? _initial;
  bool _loading = true;
  String? _loadError;

  int _step = 0; // 0..2 = data steps, 3 = "all set"
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final repo = await ref.read(onboardingRepositoryProvider.future);
      final profile = await repo.loadProfile();
      if (!mounted) return;
      setState(() {
        _repo = repo;
        _initial = profile;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loadError = e is OnboardingException
            ? e.message
            : 'Could not load your profile. Please try again.';
        _loading = false;
      });
    }
  }

  Future<String?> _saveCurrentStep() {
    final repo = _repo!;
    return switch (_step) {
      0 => _workKey.currentState?.save(repo) ?? Future.value(null),
      1 => _eduKey.currentState?.save(repo) ?? Future.value(null),
      2 => _headKey.currentState?.save(repo) ?? Future.value(null),
      _ => Future.value(null),
    };
  }

  Future<void> _continue() async {
    setState(() {
      _error = null;
      _saving = true;
    });
    final err = await _saveCurrentStep();
    if (!mounted) return;
    setState(() {
      _saving = false;
      if (err == null) {
        _step += 1;
      } else {
        _error = err;
      }
    });
  }

  void _skip() => setState(() {
    _error = null;
    _step += 1;
  });

  void _back() => setState(() {
    _error = null;
    _step -= 1;
  });

  void _finish() => context.go(AppRoutes.home);

  @override
  Widget build(BuildContext context) {
    final done = _step >= _dataSteps;
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: const BrandLogo(height: 26),
        actions: [
          if (!_loading && _loadError == null && !done)
            TextButton(onPressed: _finish, child: const Text('Skip for now')),
          const SizedBox(width: AppSpacing.sm),
        ],
      ),
      body: SafeArea(
        child: _loading
            ? const Center(child: CqLoader(message: 'Setting up your profile…'))
            : _loadError != null
            ? _ErrorView(message: _loadError!, onRetry: _retryLoad)
            : Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 520),
                  child: done ? _buildDone(context) : _buildWizard(context),
                ),
              ),
      ),
    );
  }

  void _retryLoad() {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    _load();
  }

  Widget _buildWizard(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    final (title, subtitle) = _stepMeta[_step];

    return Column(
      children: [
        // Progress + heading.
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.xl2,
            AppSpacing.lg,
            AppSpacing.xl2,
            0,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  for (var i = 0; i < _dataSteps; i++) ...[
                    Expanded(
                      child: Container(
                        height: 5,
                        decoration: BoxDecoration(
                          color: i <= _step ? cq.accent : cq.border,
                          borderRadius: BorderRadius.circular(3),
                        ),
                      ),
                    ),
                    if (i < _dataSteps - 1) const SizedBox(width: 6),
                  ],
                ],
              ),
              const SizedBox(height: AppSpacing.lg),
              Text('Step ${_step + 1} of $_dataSteps', style: text.labelMedium),
              const SizedBox(height: AppSpacing.xs),
              Text(title, style: text.headlineMedium),
              const SizedBox(height: AppSpacing.xs),
              Text(
                subtitle,
                style: text.bodyMedium?.copyWith(color: cq.fgMuted),
              ),
            ],
          ),
        ),

        // Step content — all three stay mounted (state persists across nav).
        Expanded(
          child: IndexedStack(
            index: _step,
            children: [
              SingleChildScrollView(
                padding: const EdgeInsets.all(AppSpacing.xl2),
                child: WorkProfileStep(key: _workKey, initial: _initial!),
              ),
              SingleChildScrollView(
                padding: const EdgeInsets.all(AppSpacing.xl2),
                child: EducationStep(key: _eduKey),
              ),
              SingleChildScrollView(
                padding: const EdgeInsets.all(AppSpacing.xl2),
                child: HeadlineStep(key: _headKey, initial: _initial!),
              ),
            ],
          ),
        ),

        // Error + footer nav.
        if (_error != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl2),
            child: Row(
              children: [
                Icon(Icons.error_outline_rounded, size: 18, color: cq.danger),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    _error!,
                    style: text.bodySmall?.copyWith(color: cq.danger),
                  ),
                ),
              ],
            ),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.xl2,
            AppSpacing.md,
            AppSpacing.xl2,
            AppSpacing.lg,
          ),
          child: Row(
            children: [
              Visibility(
                visible: _step > 0,
                maintainSize: true,
                maintainAnimation: true,
                maintainState: true,
                child: TextButton(
                  onPressed: _saving ? null : _back,
                  child: const Text('Back'),
                ),
              ),
              const Spacer(),
              TextButton(
                onPressed: _saving ? null : _skip,
                child: const Text('Skip'),
              ),
              const SizedBox(width: AppSpacing.sm),
              SizedBox(
                width: 138,
                child: CqPrimaryButton(
                  label: _step == _dataSteps - 1 ? 'Finish' : 'Continue',
                  loading: _saving,
                  onPressed: _continue,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildDone(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.xl2),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(color: cq.success, shape: BoxShape.circle),
            child: const Icon(Icons.check_rounded, color: Colors.white, size: 38),
          ),
          const SizedBox(height: AppSpacing.xl),
          Text("You're all set!", style: text.headlineMedium),
          const SizedBox(height: AppSpacing.sm),
          Text(
            'Your profile is ready. You can complete anything you skipped later '
            'from your profile.',
            textAlign: TextAlign.center,
            style: text.bodyLarge?.copyWith(color: cq.fgMuted),
          ),
          const SizedBox(height: AppSpacing.xl2),
          CqPrimaryButton(
            label: 'Go to Home',
            showArrow: true,
            onPressed: _finish,
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
            Icon(
              Icons.cloud_off_rounded,
              size: 40,
              color: context.cq.fgSubtle,
            ),
            const SizedBox(height: AppSpacing.lg),
            Text(message, textAlign: TextAlign.center, style: text.bodyLarge),
            const SizedBox(height: AppSpacing.xl),
            CqPrimaryButton(label: 'Try again', onPressed: onRetry),
          ],
        ),
      ),
    );
  }
}
