/// The signed-in user, as returned by the Career Queue `/auth/*` endpoints.
///
/// Hand-written (not code-generated) so every field and its JSON mapping is
/// readable at a glance.
class AuthUser {
  const AuthUser({
    required this.id,
    required this.email,
    required this.name,
    required this.role,
    required this.emailVerified,
    this.phone,
  });

  final int id;
  final String email;
  final String name;

  /// One of 'CANDIDATE' | 'RECRUITER' | 'ADMIN'.
  final String role;
  final bool emailVerified;
  final String? phone;

  bool get isCandidate => role == 'CANDIDATE';

  /// Round-trips through [AuthUser.fromJson]. Used to cache the last known
  /// user so a launch with no connectivity can restore the session instead of
  /// dumping a signed-in user on the welcome screen.
  Map<String, dynamic> toJson() => {
    'id': id,
    'email': email,
    'name': name,
    'role': role,
    'emailVerified': emailVerified,
    'phone': phone,
  };

  factory AuthUser.fromJson(Map<String, dynamic> json) {
    return AuthUser(
      id: json['id'] as int,
      email: json['email'] as String,
      name: json['name'] as String,
      role: json['role'] as String? ?? 'CANDIDATE',
      emailVerified: json['emailVerified'] as bool? ?? false,
      phone: json['phone'] as String?,
    );
  }
}
