import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http_parser/http_parser.dart';
import 'package:student_app/core/api_client.dart';
import 'package:student_app/core/models.dart';
import 'package:student_app/core/token_store.dart';
import 'package:uuid/uuid.dart';

final authRepositoryProvider = Provider((ref) => AuthRepository(ref));

class AuthRepository {
  AuthRepository(this._ref);
  final Ref _ref;

  Dio get _dio => _ref.read(dioProvider);
  TokenStore get _store => _ref.read(tokenStoreProvider);

  Future<AuthTokens> login({String? email, String? finCode, required String password}) async {
    final data = <String, dynamic>{'password': password};
    if (finCode != null && finCode.isNotEmpty) {
      data['fin_code'] = finCode;
    } else {
      data['email'] = email;
    }
    final res = await _dio.post('/api/auth/login', data: data);
    final tokens = AuthTokens.fromJson(res.data as Map<String, dynamic>);
    await _store.save(access: tokens.accessToken, refresh: tokens.refreshToken);
    return tokens;
  }

  Future<AuthTokens> register({
    required String finCode,
    required String fullName,
    required String password,
    String? email,
    String? phone,
    int? preferredRegionId,
    int? preferredAreaId,
  }) async {
    final res = await _dio.post('/api/auth/register-student', data: {
      'fin_code': finCode,
      'full_name': fullName,
      'password': password,
      if (email != null && email.isNotEmpty) 'email': email,
      if (phone != null) 'phone': phone,
      if (preferredRegionId != null) 'preferred_region_id': preferredRegionId,
      if (preferredAreaId != null) 'preferred_area_id': preferredAreaId,
    });
    final tokens = AuthTokens.fromJson(res.data as Map<String, dynamic>);
    await _store.save(access: tokens.accessToken, refresh: tokens.refreshToken);
    return tokens;
  }

  Future<UserMe> me() async {
    final res = await _dio.get('/api/auth/me');
    return UserMe.fromJson(res.data as Map<String, dynamic>);
  }

  Future<void> logout() async {
    final refresh = await _store.getRefresh();
    try {
      await _dio.post(
        '/api/auth/logout',
        data: refresh != null ? {'refresh_token': refresh} : null,
        options: Options(headers: {if (refresh != null) 'X-Refresh-Token': refresh}),
      );
    } catch (_) {}
    await _store.clear();
  }

  Future<void> deleteAccount() async {
    await _dio.delete('/api/auth/me');
    await _store.clear();
  }

  Future<bool> hasSession() async {
    final t = await _store.getAccess();
    return t != null && t.isNotEmpty;
  }
}

final catalogRepositoryProvider = Provider((ref) => CatalogRepository(ref));

class CatalogRepository {
  CatalogRepository(this._ref);
  final Ref _ref;
  Dio get _dio => _ref.read(dioProvider);

  Future<List<Region>> regions() async {
    final res = await _dio.get('/api/regions');
    return (res.data as List).map((e) => Region.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<Area>> areas(int regionId) async {
    final res = await _dio.get('/api/regions/$regionId/areas');
    return (res.data as List).map((e) => Area.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<CatalogExam>> exams({
    int? regionId,
    int? areaId,
    double? nearLat,
    double? nearLng,
    double? radiusKm,
  }) async {
    final res = await _dio.get('/api/student/exams', queryParameters: {
      if (regionId != null) 'region_id': regionId,
      if (areaId != null) 'area_id': areaId,
      if (nearLat != null) 'near_lat': nearLat,
      if (nearLng != null) 'near_lng': nearLng,
      if (radiusKm != null) 'radius_km': radiusKm,
    });
    return (res.data as List).map((e) => CatalogExam.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<ExamDetail> examDetail(int id) async {
    final res = await _dio.get('/api/student/exams/$id');
    return ExamDetail.fromJson(res.data as Map<String, dynamic>);
  }

  Future<CheckoutResult> checkout(int ticketId, {int quantity = 1}) async {
    final key = const Uuid().v4();
    final res = await _dio.post(
      '/api/student/tickets/$ticketId/checkout',
      data: {'quantity': quantity},
      options: Options(headers: {'Idempotency-Key': key}),
    );
    return CheckoutResult.fromJson(res.data as Map<String, dynamic>);
  }
}

final portalRepositoryProvider = Provider((ref) => PortalRepository(ref));

class PortalRepository {
  PortalRepository(this._ref);
  final Ref _ref;
  Dio get _dio => _ref.read(dioProvider);

  Future<StudentProfile> profile() async {
    final res = await _dio.get('/api/me/student');
    return StudentProfile.fromJson(res.data as Map<String, dynamic>);
  }

  Future<void> updateProfile({
    String? fullName,
    String? phone,
    int? preferredRegionId,
    int? preferredAreaId,
    String? bio,
    String? schoolName,
    String? gradeLabel,
  }) async {
    await _dio.patch('/api/me/student', data: {
      if (fullName != null) 'full_name': fullName,
      if (phone != null) 'phone': phone,
      if (preferredRegionId != null) 'preferred_region_id': preferredRegionId,
      if (preferredAreaId != null) 'preferred_area_id': preferredAreaId,
      if (bio != null) 'bio': bio,
      if (schoolName != null) 'school_name': schoolName,
      if (gradeLabel != null) 'grade_label': gradeLabel,
    });
  }

  Future<void> uploadAvatar(List<int> bytes, {String filename = 'avatar.jpg', String contentType = 'image/jpeg'}) async {
    final parts = contentType.split('/');
    final form = FormData.fromMap({
      'file': MultipartFile.fromBytes(
        bytes,
        filename: filename,
        contentType: MediaType(parts.first, parts.length > 1 ? parts[1] : 'jpeg'),
      ),
    });
    await _dio.post('/api/me/student/avatar', data: form);
  }

  String avatarUrl() => '${_dio.options.baseUrl}/api/me/student/avatar';

  Future<void> registerDevice({
    required String platform,
    required String pushToken,
    String? appVersion,
  }) async {
    await _dio.post('/api/me/student/devices', data: {
      'platform': platform,
      'push_token': pushToken,
      if (appVersion != null) 'app_version': appVersion,
    });
  }

  Future<Map<String, dynamic>> examDetail(int examId) async {
    final res = await _dio.get('/api/me/student/exams/$examId');
    return res.data as Map<String, dynamic>;
  }
}
