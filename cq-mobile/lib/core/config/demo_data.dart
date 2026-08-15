// Sample data for the authenticated screens when running in demo/offline mode
// (AppConfig.demoMode). Each map matches the real API response shape and is
// parsed through the same `fromJson` the live path uses, so demo and live render
// identically — only the source differs.

abstract final class DemoData {
  static String _daysAgo(int d) =>
      DateTime.now().subtract(Duration(days: d)).toIso8601String();

  static Map<String, dynamic> get savedJobs => {
    'hits': [
      {
        'jobId': 12001,
        'savedAt': _daysAgo(1),
        'applied': false,
        'job': {
          'title': 'Senior Flutter Engineer',
          'canonicalSlug': 'senior-flutter-engineer-lumen-labs-12001',
          'status': 'ACTIVE',
          'company': {'name': 'Lumen Labs'},
        },
      },
      {
        'jobId': 12006,
        'savedAt': _daysAgo(3),
        'applied': true,
        'appliedStatus': 'IN_REVIEW',
        'job': {
          'title': 'Android Engineer',
          'canonicalSlug': 'android-engineer-playverse-12006',
          'status': 'ACTIVE',
          'company': {'name': 'Playverse'},
        },
      },
      {
        'jobId': 12007,
        'savedAt': _daysAgo(6),
        'applied': false,
        'job': {
          'title': 'DevOps Engineer',
          'canonicalSlug': 'devops-engineer-cloudspur-12007',
          'status': 'ACTIVE',
          'company': {'name': 'Cloudspur'},
        },
      },
    ],
    'total': 3,
    'page': 1,
    'pageSize': 20,
  };

  static Map<String, dynamic> get applications => {
    'hits': [
      {
        'id': 90001,
        'status': 'IN_REVIEW',
        'appliedAt': _daysAgo(2),
        'updatedAt': _daysAgo(1),
        'job': {
          'title': 'Android Engineer',
          'canonicalSlug': 'android-engineer-playverse-90001',
          'company': {'id': 5001, 'slug': 'playverse', 'name': 'Playverse'},
        },
        'statusHistory': [
          {'from': 'APPLIED', 'to': 'IN_REVIEW', 'at': _daysAgo(1), 'by': 'RECRUITER'},
        ],
      },
      {
        'id': 90002,
        'status': 'SHORTLISTED',
        'appliedAt': _daysAgo(9),
        'updatedAt': _daysAgo(4),
        'job': {
          'title': 'Backend Engineer (Node.js)',
          'canonicalSlug': 'backend-engineer-node-js-finixo-90002',
          'company': {'id': 5002, 'slug': 'finixo', 'name': 'Finixo'},
        },
        'statusHistory': [
          {'from': 'APPLIED', 'to': 'IN_REVIEW', 'at': _daysAgo(7), 'by': 'RECRUITER'},
          {'from': 'IN_REVIEW', 'to': 'SHORTLISTED', 'at': _daysAgo(4), 'by': 'RECRUITER'},
        ],
      },
      {
        'id': 90003,
        'status': 'REJECTED',
        'appliedAt': _daysAgo(20),
        'updatedAt': _daysAgo(12),
        'job': {
          'title': 'Data Analyst',
          'canonicalSlug': 'data-analyst-kite-retail-90003',
          'company': {'id': 5003, 'slug': 'kite-retail', 'name': 'Kite Retail'},
        },
        'statusHistory': [
          {'from': 'APPLIED', 'to': 'IN_REVIEW', 'at': _daysAgo(17), 'by': 'RECRUITER'},
          {'from': 'IN_REVIEW', 'to': 'REJECTED', 'at': _daysAgo(12), 'by': 'RECRUITER'},
        ],
      },
    ],
    'total': 3,
    'page': 1,
    'pageSize': 20,
  };

  static Map<String, dynamic> get profile => {
    'user': {
      'name': 'Demo User',
      'email': 'demo@careerqueue.app',
      'emailVerified': true,
      'phone': '+91 90000 00000',
    },
    'candidate': {
      'profileCompleteness': 72,
      'skillIds': [1, 2, 3, 4, 5],
      'workStatus': 'EXPERIENCED',
      'lookingFor': 'JOB',
      'experienceMonths': 54,
      'currentTitle': 'Flutter Developer',
      'currentCompanyName': 'Lumen Labs',
      'currentCityName': 'Bengaluru',
      'headline': 'Mobile engineer who loves shipping polished apps',
      'expectedSalaryMinPaise': 240000000,
    },
    'educationCount': 2,
    'experienceCount': 2,
  };

  static List<Map<String, dynamic>> get alerts => [
    {
      'id': 5001,
      'name': 'Flutter jobs in Bengaluru',
      'frequency': 'daily',
      'isActive': true,
      'query': {'q': 'flutter', 'city': 'bengaluru'},
      'lastSentAt': _daysAgo(1),
    },
    {
      'id': 5002,
      'name': 'Remote backend roles',
      'frequency': 'weekly',
      'isActive': false,
      'query': {'q': 'backend', 'mode': 'remote'},
    },
  ];

  static Map<String, dynamic> get notificationPreferences => {
    'jobAlertsEnabled': true,
    'applicationStatusEnabled': true,
    'productNewsEnabled': false,
  };
}
