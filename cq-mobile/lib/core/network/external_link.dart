/// Opening a URL that came from the server, safely.
///
/// **Why this is not just `launchUrl(Uri.parse(url))`:** company website URLs
/// are recruiter-supplied. The API validates them with Zod's `.url()`, which is
/// a *parseability* check, not a scheme check — `javascript:`, `data:`,
/// `file:///…` and `intent://…` all pass it. Rows written before that DTO
/// existed, or written straight to the database, are not even covered by that.
/// Handing such a value to `launchUrl(..., externalApplication)` is a real
/// escalation on Android, where an `intent://` URL can address another app.
///
/// So the rule here is an allowlist: **http and https only**, everything else
/// refused. Anything the server sends that is not plainly a web address simply
/// does not open.
library;

import 'package:url_launcher/url_launcher.dart';

/// Normalise and validate a server-supplied web address.
///
/// Returns null when the value cannot be trusted as a web link. A bare host
/// (`acme.com`) is accepted and upgraded to `https://` — legacy rows and
/// seed data often lack a scheme, and `Uri.parse` would otherwise produce a
/// scheme-less URI that no browser can open.
Uri? safeWebUri(String? raw) {
  final value = raw?.trim() ?? '';
  if (value.isEmpty) return null;

  final hasScheme = value.startsWith('http://') || value.startsWith('https://');
  // Only prepend a scheme when the value carries NO scheme at all. Doing it by
  // checking for "://" would turn `javascript:alert(1)` into
  // `https://javascript:alert(1)` — laundering a hostile value into an
  // acceptable-looking one instead of rejecting it.
  final candidate = hasScheme
      ? value
      : (value.contains(':') ? value : 'https://$value');

  final uri = Uri.tryParse(candidate);
  if (uri == null) return null;
  if (uri.scheme != 'http' && uri.scheme != 'https') return null;
  if (uri.host.isEmpty) return null;
  return uri;
}

/// Open [raw] in the device browser. Returns false if the URL was refused or
/// no app could handle it, so the caller can show a message rather than leaving
/// a tap that appears to do nothing.
Future<bool> openExternalLink(String? raw) async {
  final uri = safeWebUri(raw);
  if (uri == null) return false;
  try {
    // `externalApplication` rather than an in-app webview: the site is someone
    // else's, and the browser gives the user the address bar and their own
    // session. Not gated on canLaunchUrl — that reports false in cases where
    // the launch would actually succeed, and the return value already tells us.
    return await launchUrl(uri, mode: LaunchMode.externalApplication);
  } catch (_) {
    return false;
  }
}

/// `https://www.acme.com/careers` → `acme.com` — the compact label for a link
/// chip. Falls back to the raw value when it cannot be parsed.
String hostLabel(String url) {
  final host = Uri.tryParse(url.trim())?.host ?? '';
  if (host.isEmpty) return url.trim();
  return host.replaceFirst(RegExp(r'^www\.'), '');
}
