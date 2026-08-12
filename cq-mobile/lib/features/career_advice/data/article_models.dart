// Career-advice / article models, shaped to the agreed API contract
// (GET /career-advice, GET /career-advice/:slug). The backend serves the
// article body as raw markdown (rendered on-device), not HTML.

class ArticleSummary {
  const ArticleSummary({
    required this.slug,
    required this.title,
    required this.authorName,
    this.excerpt,
    this.publishedAt,
    this.readTimeMinutes,
    this.tags = const [],
    this.coverImageUrl,
  });

  final String slug;
  final String title;
  final String authorName;
  final String? excerpt;
  final DateTime? publishedAt;
  final int? readTimeMinutes;
  final List<String> tags;
  final String? coverImageUrl;

  factory ArticleSummary.fromJson(Map<String, dynamic> j) => ArticleSummary(
    slug: j['slug'] as String? ?? '',
    title: j['title'] as String? ?? '',
    authorName: j['authorName'] as String? ?? '',
    excerpt: j['excerpt'] as String?,
    publishedAt: DateTime.tryParse(j['publishedAt'] as String? ?? ''),
    readTimeMinutes: (j['readTimeMinutes'] as num?)?.toInt(),
    tags: ((j['tags'] as List?) ?? const []).whereType<String>().toList(),
    coverImageUrl: j['coverImageUrl'] as String?,
  );
}

class ArticlesPage {
  const ArticlesPage({
    required this.hits,
    required this.total,
    required this.page,
    required this.pageSize,
  });

  final List<ArticleSummary> hits;
  final int total;
  final int page;
  final int pageSize;

  int get totalPages => pageSize == 0 ? 1 : (total + pageSize - 1) ~/ pageSize;

  factory ArticlesPage.fromJson(Map<String, dynamic> j) => ArticlesPage(
    hits: ((j['hits'] as List?) ?? const [])
        .whereType<Map>()
        .map((m) => ArticleSummary.fromJson(m.cast<String, dynamic>()))
        .toList(),
    total: (j['total'] as num?)?.toInt() ?? 0,
    page: (j['page'] as num?)?.toInt() ?? 1,
    pageSize: (j['pageSize'] as num?)?.toInt() ?? 12,
  );
}

class ArticleFaq {
  const ArticleFaq({required this.question, required this.answer});
  final String question;
  final String answer;

  factory ArticleFaq.fromJson(Map<String, dynamic> j) => ArticleFaq(
    question: j['question'] as String? ?? '',
    answer: j['answer'] as String? ?? '',
  );
}

class ArticleDetail {
  const ArticleDetail({
    required this.slug,
    required this.title,
    required this.body,
    required this.authorName,
    this.id,
    this.excerpt,
    this.publishedAt,
    this.updatedAt,
    this.readTimeMinutes,
    this.tags = const [],
    this.faqs = const [],
    this.coverImageUrl,
  });

  final String slug;
  final String title;

  /// Raw markdown (rendered with SimpleMarkdown).
  final String body;
  final String authorName;
  final int? id;
  final String? excerpt;
  final DateTime? publishedAt;
  final DateTime? updatedAt;
  final int? readTimeMinutes;
  final List<String> tags;
  final List<ArticleFaq> faqs;
  final String? coverImageUrl;

  factory ArticleDetail.fromJson(Map<String, dynamic> j) => ArticleDetail(
    slug: j['slug'] as String? ?? '',
    title: j['title'] as String? ?? '',
    // Prefer raw markdown `body`; tolerate a `bodyHtml`/`bodyMarkdown` variant.
    body: (j['body'] ?? j['bodyMarkdown'] ?? j['bodyHtml'] ?? '') as String,
    authorName: j['authorName'] as String? ?? '',
    id: (j['id'] as num?)?.toInt(),
    excerpt: j['excerpt'] as String?,
    publishedAt: DateTime.tryParse(j['publishedAt'] as String? ?? ''),
    updatedAt: DateTime.tryParse(j['updatedAt'] as String? ?? ''),
    readTimeMinutes: (j['readTimeMinutes'] as num?)?.toInt(),
    tags: ((j['tags'] as List?) ?? const []).whereType<String>().toList(),
    faqs: ((j['faqs'] as List?) ?? const [])
        .whereType<Map>()
        .map((m) => ArticleFaq.fromJson(m.cast<String, dynamic>()))
        .toList(),
    coverImageUrl: j['coverImageUrl'] as String?,
  );
}
