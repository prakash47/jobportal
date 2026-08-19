import 'package:cq_mobile/features/applications/data/application.dart';
import 'package:cq_mobile/features/home/data/home_models.dart';
import 'package:cq_mobile/features/jobs/data/job_models.dart';
import 'package:cq_mobile/features/saved_jobs/data/saved_job.dart';
import 'package:cq_mobile/features/settings/data/notification_preferences.dart';
import 'package:flutter_test/flutter_test.dart';

/// Response parsing is the app's whole contract with the backend, and it is the
/// one place where a server change lands as a crash or — worse — as a plausible
/// wrong number in front of a candidate. These tests pin three things per
/// parser: the real shape maps correctly, an empty object does not throw, and
/// nothing is invented to fill a gap.
void main() {
  group('JobSummary', () {
    test('maps a search hit', () {
      final j = JobSummary.fromJson({
        'id': 42,
        'title': 'Flutter Engineer',
        'canonicalSlug': 'flutter-engineer-acme-42',
        'company': {'id': 7, 'name': 'Acme', 'slug': 'acme'},
        'postedAt': '2026-08-01T10:00:00.000Z',
        'city': 'Bengaluru',
        'salaryMin': 120000000,
        'salaryMax': 180000000,
        'minExperienceMonths': 24,
        'skills': ['Dart', 'Flutter'],
        'isSaved': true,
        'isApplied': false,
      });
      expect(j.id, 42);
      expect(j.company.name, 'Acme');
      expect(j.salaryMin, 120000000);
      expect(j.skills, ['Dart', 'Flutter']);
      expect(j.isSaved, isTrue);
      expect(j.postedAt, DateTime.utc(2026, 8, 1, 10));
    });

    test('survives an object with nothing in it', () {
      final j = JobSummary.fromJson(const {});
      expect(j.title, '');
      expect(j.skills, isEmpty);
      expect(j.isSaved, isFalse);
    });

    test('leaves an absent postedAt unknown instead of calling it today', () {
      // This used to default to DateTime.now(), so a listing whose timestamp
      // the server omitted was shown as posted today. Recency is a decision
      // input on a job board; a fabricated one is worse than a missing one.
      expect(JobSummary.fromJson(const {}).postedAt, isNull);
      expect(JobSummary.fromJson(const {'postedAt': 'not a date'}).postedAt, isNull);
    });

    test('accepts a number the server sent as a double', () {
      // Every salary column is a Postgres Int today, but nothing stops a
      // computed or aggregated field arriving as 1.2e8.
      final j = JobSummary.fromJson(const {'id': 9.0, 'salaryMin': 120000000.0});
      expect(j.id, 9);
      expect(j.salaryMin, 120000000);
    });

    test('ignores non-string entries in skills rather than throwing', () {
      final j = JobSummary.fromJson(const {
        'skills': ['Dart', 42, null, 'Flutter'],
      });
      expect(j.skills, ['Dart', 'Flutter']);
    });
  });

  group('JobsPage', () {
    test('maps a page envelope', () {
      final p = JobsPage.fromJson(const {
        'hits': [
          {'id': 1, 'title': 'A'},
        ],
        'total': 137,
        'page': 3,
        'pageSize': 20,
      });
      expect(p.hits.single.title, 'A');
      expect(p.total, 137);
      expect(p.totalPages, 7); // 137 / 20 rounded up
    });

    test('an empty envelope is an empty page, not a crash', () {
      final p = JobsPage.fromJson(const {});
      expect(p.hits, isEmpty);
      expect(p.total, 0);
    });
  });

  group('ApplyQuota', () {
    test('maps the quota', () {
      final q = ApplyQuota.fromJson(const {
        'count': 8,
        'limit': 10,
        'unlimited': false,
        'upgradeAvailable': true,
      });
      expect(q.count, 8);
      expect(q.limit, 10);
      expect(q.upgradeAvailable, isTrue);
    });

    test('never guesses the daily limit', () {
      // The cap is configured server-side, so inventing 10 here would show a
      // number that disagrees with whatever the environment actually enforces.
      expect(ApplyQuota.fromJson(const {}).limit, 0);
      expect(ApplyQuota.fromJson(const {}).unlimited, isFalse);
    });
  });

  group('HomeFeed', () {
    test('an empty feed yields empty sections, not nulls', () {
      final f = HomeFeed.fromJson(const {});
      expect(f.counts.activeJobs, 0);
      expect(f.featuredJobs, isEmpty);
      expect(f.featuredCompanies, isEmpty);
      expect(f.recentArticles, isEmpty);
    });

    test('maps counts and a featured job', () {
      final f = HomeFeed.fromJson(const {
        'counts': {'activeJobs': 1200, 'companies': 80, 'recruiters': 45},
        'featuredJobs': [
          {'title': 'SDE', 'companyName': 'Acme', 'canonicalSlug': 'sde-acme-1'},
        ],
      });
      expect(f.counts.activeJobs, 1200);
      expect(f.featuredJobs.single.companyName, 'Acme');
      expect(f.featuredJobs.single.postedAt, isNull);
    });
  });

  group('Application', () {
    test('maps an application with its status history', () {
      final a = Application.fromJson(const {
        'id': 5,
        'status': 'SHORTLISTED',
        'appliedAt': '2026-07-01T00:00:00.000Z',
        'updatedAt': '2026-07-09T00:00:00.000Z',
        'jobTitle': 'SDE',
        'companyName': 'Acme',
        'statusHistory': [
          {'to': 'APPLIED', 'at': '2026-07-01T00:00:00.000Z'},
          {'to': 'SHORTLISTED', 'from': 'APPLIED', 'at': '2026-07-09T00:00:00.000Z'},
        ],
      });
      expect(a.status, 'SHORTLISTED');
      expect(a.statusHistory, hasLength(2));
      expect(a.statusHistory.last.from, 'APPLIED');
    });

    test('absent timestamps stay unknown rather than becoming 1 Jan 2000', () {
      final a = Application.fromJson(const {'id': 5, 'status': 'APPLIED'});
      expect(a.appliedAt, isNull);
      expect(a.updatedAt, isNull);
      final e = StatusEvent.fromJson(const {'to': 'APPLIED'});
      expect(e.at, isNull);
    });

    test('an application with no history is not a crash', () {
      final a = Application.fromJson(const {'id': 5, 'status': 'APPLIED'});
      expect(a.statusHistory, isEmpty);
      // A generic placeholder, so the row still reads as a row.
      expect(a.jobTitle, 'Job');
    });
  });

  group('SavedJob', () {
    test('maps a saved job and its applied marker', () {
      // The saved-jobs endpoint nests the job rather than flattening it, and
      // the company inside that again. Parsing the flat shape by mistake yields
      // a row of blanks with no error anywhere, so the nesting is pinned here.
      final s = SavedJob.fromJson(const {
        'jobId': 11,
        'savedAt': '2026-08-10T00:00:00.000Z',
        'applied': true,
        'appliedStatus': 'IN_REVIEW',
        'job': {
          'canonicalSlug': 'sde-acme-11',
          'title': 'SDE',
          'status': 'ACTIVE',
          'company': {'name': 'Acme'},
        },
      });
      expect(s.jobId, 11);
      expect(s.title, 'SDE');
      expect(s.companyName, 'Acme');
      expect(s.canonicalSlug, 'sde-acme-11');
      expect(s.isActive, isTrue);
      expect(s.appliedStatus, 'IN_REVIEW');
    });

    test('a job the server no longer calls ACTIVE is not shown as active', () {
      final s = SavedJob.fromJson(const {
        'jobId': 1,
        'job': {'status': 'EXPIRED'},
      });
      expect(s.isActive, isFalse);
    });

    test('an absent savedAt is unknown, not 1 Jan 2000', () {
      // The sentinel rendered literally: "Saved 1 Jan 2000" on a row the user
      // had just saved. Same class as the fabricated postedAt.
      expect(SavedJob.fromJson(const {'jobId': 1}).savedAt, isNull);
    });

    test('an absent status is assumed ACTIVE — deliberately', () {
      // The one invented default kept on purpose: the endpoint always sends a
      // status, and guessing "unavailable" instead would stamp every saved job
      // with a scary badge the moment the field were ever renamed. The card
      // still has an "Unavailable" branch for statuses it does not recognise.
      expect(SavedJob.fromJson(const {'jobId': 1}).isActive, isTrue);
    });
  });

  group('NotificationPreferences', () {
    test('maps every switch', () {
      // The wire keys carry an `Enabled` suffix and one of them is renamed
      // outright (applicationUpdates -> applicationStatusEnabled). Reading the
      // Dart field names by mistake silently falls back to the defaults, which
      // looks exactly like a working screen.
      final p = NotificationPreferences.fromJson(const {
        'jobAlertsEnabled': false,
        'applicationStatusEnabled': true,
        'productNewsEnabled': false,
      });
      expect(p.jobAlerts, isFalse);
      expect(p.applicationUpdates, isTrue);
    });

    test('the PATCH body uses the wire keys, not the Dart field names', () {
      // The endpoint is .strict(), so a wrong key is a 400 rather than a
      // silently ignored change.
      const prefs = NotificationPreferences(
        jobAlerts: true,
        applicationUpdates: false,
        productNews: true,
      );
      expect(prefs.toJson(), const {
        'jobAlertsEnabled': true,
        'applicationStatusEnabled': false,
        'productNewsEnabled': true,
      });
    });

    test('a missing switch does not silently read as off', () {
      // Showing a toggle as off when the server never said so would tell a
      // candidate their alerts are disabled while the server keeps sending
      // them — the settings screen has to match reality.
      final p = NotificationPreferences.fromJson(const {});
      expect(p.jobAlerts, isTrue);
      expect(p.applicationUpdates, isTrue);
    });
  });
}
