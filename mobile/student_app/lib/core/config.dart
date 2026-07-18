/// REST API base — production domain by default.
/// Override: `--dart-define=API_BASE=https://bilik.sayt.cam`
class AppConfig {
  static const apiBase = String.fromEnvironment(
    'API_BASE',
    defaultValue: 'https://bilik.sayt.cam',
  );

  static const appScheme = 'imtahansistemi';

  /// Normalized origin without trailing slash (REST paths start with `/api/...`).
  static String get apiOrigin {
    var base = apiBase.trim();
    while (base.endsWith('/')) {
      base = base.substring(0, base.length - 1);
    }
    return base;
  }
}
