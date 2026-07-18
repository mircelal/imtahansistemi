import 'package:dio/dio.dart';
import 'package:student_app/core/config.dart';

String apiErrorMessage(Object error, {String fallback = 'Əməliyyat alınmadı'}) {
  if (error is DioException) {
    final data = error.response?.data;
    if (data is Map && data['detail'] != null) {
      final detail = data['detail'];
      if (detail is String) return detail;
      if (detail is List && detail.isNotEmpty) {
        final first = detail.first;
        if (first is Map && first['msg'] != null) return first['msg'].toString();
        return first.toString();
      }
    }
    switch (error.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return 'Serverə qoşulma vaxtı bitdi. Yenidən cəhd edin.';
      case DioExceptionType.connectionError:
      case DioExceptionType.unknown:
        return 'Serverə qoşulmaq mümkün olmadı (${AppConfig.apiOrigin}). İnterneti yoxlayın.';
      default:
        if (error.response?.statusCode == 401) {
          return 'FIN/email və ya şifrə yanlışdır';
        }
        if (error.response?.statusCode == 403) {
          return 'Bu əməliyyat üçün icazə yoxdur';
        }
        if (error.response?.statusCode == 404) {
          return 'Resurs tapılmadı';
        }
        if (error.response?.statusCode == 422) {
          return 'Göndərilən məlumatlar yanlışdır';
        }
        if (error.response?.statusCode == 429) {
          return 'Çox cəhd — bir az sonra yenidən yoxlayın';
        }
        if (error.response?.statusCode != null && error.response!.statusCode! >= 500) {
          return 'Server xətası (${error.response!.statusCode}). Bir az sonra yenidən yoxlayın.';
        }
    }
  }
  return fallback;
}
