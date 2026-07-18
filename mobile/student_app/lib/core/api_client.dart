import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:student_app/core/config.dart';
import 'package:student_app/core/token_store.dart';
import 'package:uuid/uuid.dart';

final tokenStoreProvider = Provider((ref) => TokenStore());

/// REST client — all resources under `{origin}/api/...`
final dioProvider = Provider<Dio>((ref) {
  final store = ref.watch(tokenStoreProvider);
  final dio = Dio(
    BaseOptions(
      baseUrl: AppConfig.apiOrigin,
      connectTimeout: const Duration(seconds: 25),
      receiveTimeout: const Duration(seconds: 45),
      sendTimeout: const Duration(seconds: 25),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Client': 'student-app/flutter',
      },
      // REST: only 2xx are success; 4xx/5xx throw DioException
      validateStatus: (status) => status != null && status >= 200 && status < 300,
      followRedirects: true,
      maxRedirects: 3,
    ),
  );

  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) async {
        // Ensure paths are absolute REST paths from origin
        if (!options.path.startsWith('/')) {
          options.path = '/${options.path}';
        }
        final path = options.path;
        final skipAuth = path.startsWith('/api/auth/login') ||
            path.startsWith('/api/auth/register-student') ||
            path.startsWith('/api/auth/refresh') ||
            path.startsWith('/api/auth/bootstrap') ||
            path.startsWith('/api/regions') ||
            path.startsWith('/api/public/') ||
            path.startsWith('/health');
        if (!skipAuth) {
          final token = await store.getAccess();
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
        }
        options.headers['X-Correlation-Id'] = const Uuid().v4();
        options.headers['X-Request-Id'] = const Uuid().v4();
        handler.next(options);
      },
      onError: (err, handler) async {
        final path = err.requestOptions.path;
        final isAuthEndpoint = path.contains('/api/auth/login') ||
            path.contains('/api/auth/register-student') ||
            path.contains('/api/auth/refresh');
        if (err.response?.statusCode == 401 && !isAuthEndpoint) {
          final refreshed = await _tryRefresh(store);
          if (refreshed) {
            final req = err.requestOptions;
            final token = await store.getAccess();
            req.headers['Authorization'] = 'Bearer $token';
            try {
              final clone = await dio.fetch(req);
              return handler.resolve(clone);
            } catch (_) {
              return handler.next(err);
            }
          }
          await store.clear();
        }
        handler.next(err);
      },
    ),
  );
  return dio;
});

Future<bool> _tryRefresh(TokenStore store) async {
  final refresh = await store.getRefresh();
  if (refresh == null || refresh.isEmpty) return false;
  try {
    final res = await Dio(
      BaseOptions(
        baseUrl: AppConfig.apiOrigin,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      ),
    ).post('/api/auth/refresh', data: {'refresh_token': refresh});
    final access = res.data['access_token'] as String?;
    final newRefresh = res.data['refresh_token'] as String?;
    if (access == null) return false;
    await store.save(access: access, refresh: newRefresh ?? refresh);
    return true;
  } catch (_) {
    return false;
  }
}
