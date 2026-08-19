import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/cq_buttons.dart';
import '../../../shared/widgets/cq_loader.dart';
import '../data/candidate_profile.dart';
import '../data/onboarding_repository.dart';
import 'steps/education_step.dart';
import 'steps/headline_step.dart';
import 'steps/work_profile_step.dart';
import '../../../shared/widgets/cq_states.dart';

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

  final _pages = PageController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
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

  /// Keeps the PageView in sync with [_step] after any setState that moved it.
  /// The steps stay mounted either way — this only animates which one shows.
  void _syncPage() {
    if (!_pages.hasClients || _step >= _dataSteps) return;
    if (_pages.page?.round() == _step) return;
    _pages.animateToPage(
      _step,
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOut,
    );
  }

  void _finish() => context.go(AppRoutes.home);

  @override
  Widget build(BuildContext context) {
    final done = _step >= _dataSteps;
    WidgetsBinding.instance.addPostFrameCallback((_) => _syncPage());
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        // No logo here. The stacked CQ lockup is 1.66:1 with the wordmark in
        // its bottom quarter, so at an AppBar's 26px the words render about 6px
        // tall — unreadable mush. The user authenticated seconds ago under that
        // logo at full size; repeating it small adds nothing.
        leading: (!_loading && _loadError == null && !done && _step > 0)
            ? IconButton(
                icon: const Icon(Icons.arrow_back_rounded),
                tooltip: 'Back',
                onPressed: _saving ? null : _back,
              )
            : null,
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
            // blocking: the wizard cannot continue without the profile load,
            // so the retry is the primary action here (as it was before this
            // view was shared).
            ? CqErrorView(
                message: _loadError!,
                onRetry: _retryLoad,
                blocking: true,
              )
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

    return Column(
      children: [
        // ── Progress rail ──
        //
        // One full-bleed 2px line flush under the AppBar, not three inset
        // segments. Edge-to-edge reads as part of the chrome; a gutter-inset
        // segmented bar reads as a stock wizard. It animates rather than
        // snapping, which is the only progress cue on the screen now.
        TweenAnimationBuilder<double>(
          tween: Tween(begin: 0, end: (_step + 1) / _dataSteps),
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOut,
          builder: (context, value, _) => SizedBox(
            height: 2,
            child: Row(
              children: [
                Expanded(
                  flex: (value * 1000).round(),
                  child: ColoredBox(color: cq.accent),
                ),
                Expanded(
                  flex: 1000 - (value * 1000).round(),
                  child: ColoredBox(color: cq.border),
                ),
              ],
            ),
          ),
        ),

        // ── Steps ──
        //
        // A PageView rather than an IndexedStack: all three stay mounted (so a
        // half-filled step survives Back), but moving between them now slides.
        Expanded(
          child: PageView(
            controller: _pages,
            physics: const NeverScrollableScrollPhysics(),
            children: [
              _stepPage(0, WorkProfileStep(key: _workKey, initial: _initial!)),
              _stepPage(1, EducationStep(key: _eduKey)),
              _stepPage(2, HeadlineStep(key: _headKey, initial: _initial!)),
            ],
          ),
        ),

        // ── Actions ──
        //
        // Pinned, hairline-separated, and stacked full width. The old row put a
        // 138px cyan CTA next to two bare blue text buttons — three competing
        // treatments in one row, and the only place in the app where the
        // primary button was not full width.
        Container(
          decoration: BoxDecoration(
            border: Border(top: BorderSide(color: cq.border)),
          ),
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.xl2,
                AppSpacing.lg,
                AppSpacing.xl2,
                AppSpacing.lg,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (_error != null) ...[
                    Row(
                      children: [
                        Icon(
                          Icons.error_outline_rounded,
                          size: 18,
                          color: cq.danger,
                        ),
                        const SizedBox(width: AppSpacing.sm),
                        Expanded(
                          child: Text(
                            _error!,
                            style: text.bodySmall?.copyWith(color: cq.danger),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.md),
                  ],
                  CqPrimaryButton(
                    label: _step == _dataSteps - 1 ? 'Finish' : 'Continue',
                    loading: _saving,
                    onPressed: _continue,
                  ),
                  const SizedBox(height: AppSpacing.md),
                  SizedBox(
                    width: double.infinity,
                    height: 52,
                    child: OutlinedButton(
                      onPressed: _saving ? null : _skip,
                      child: const Text('Skip this step'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  /// One step: its own header scrolling with its own fields, so the title moves
  /// out of the way on a small screen instead of permanently eating the top
  /// third of the viewport.
  Widget _stepPage(int index, Widget child) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    final (title, subtitle) = _stepMeta[index];

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.xl2,
        AppSpacing.xl,
        AppSpacing.xl2,
        AppSpacing.xl2,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'STEP ${index + 1} OF $_dataSteps',
            style: text.labelSmall?.copyWith(
              color: cq.fgSubtle,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          // 30px, not 24: onboarding is a full-screen moment and should own the
          // page the way the auth hero does.
          Text(title, style: text.headlineLarge),
          const SizedBox(height: AppSpacing.sm),
          // 16px, deliberately LARGER than the 14px field labels below it — at
          // 14 it competed with them and the hierarchy read flat.
          Text(subtitle, style: text.bodyLarge?.copyWith(color: cq.fgMuted)),
          const SizedBox(height: AppSpacing.xl2),
          child,
        ],
      ),
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
          // A brand panel, not a stock green success circle. The navy + cyan
          // pairing is the same one the welcome hero and the loader use, so the
          // last screen of onboarding looks like the first screen of the app.
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.xl2,
              vertical: AppSpacing.xl2 + AppSpacing.sm,
            ),
            decoration: BoxDecoration(
              color: cq.brandNavy,
              borderRadius: BorderRadius.circular(AppRadius.lg),
            ),
            child: Column(
              children: [
                Icon(Icons.check_rounded, size: 34, color: cq.accent),
                const SizedBox(height: AppSpacing.lg),
                Text(
                  "You're all set",
                  textAlign: TextAlign.center,
                  style: text.headlineLarge?.copyWith(
                    color: const Color(0xFFF7F9FC),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.xl),
          Text(
            'Your profile is ready. Anything you skipped can be completed later '
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

