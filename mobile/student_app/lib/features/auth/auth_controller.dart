import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:student_app/core/api_errors.dart';
import 'package:student_app/core/location_service.dart';
import 'package:student_app/core/models.dart';
import 'package:student_app/core/repositories.dart';

final authStateProvider = AsyncNotifierProvider<AuthController, UserMe?>(AuthController.new);

class AuthController extends AsyncNotifier<UserMe?> {
  @override
  Future<UserMe?> build() async {
    final auth = ref.read(authRepositoryProvider);
    if (!await auth.hasSession()) return null;
    try {
      return await auth.me();
    } catch (e) {
      debugPrint('Session restore failed: $e');
      await auth.logout();
      return null;
    }
  }

  /// Returns signed-in user or throws with a readable message.
  Future<UserMe> login({String? email, String? finCode, required String password}) async {
    state = const AsyncLoading();
    try {
      await ref.read(authRepositoryProvider).login(
            email: email,
            finCode: finCode,
            password: password,
          );
      final user = await ref.read(authRepositoryProvider).me();
      if (user.role != 'student') {
        await ref.read(authRepositoryProvider).logout();
        throw Exception('Bu tətbiq yalnız şagird hesabları üçündür');
      }
      state = AsyncData(user);
      return user;
    } catch (e, st) {
      state = AsyncError(e, st);
      throw Exception(apiErrorMessage(e, fallback: 'Giriş alınmadı'));
    }
  }

  Future<UserMe> register({
    required String finCode,
    required String fullName,
    required String password,
    String? email,
    int? preferredRegionId,
    int? preferredAreaId,
  }) async {
    state = const AsyncLoading();
    try {
      await ref.read(authRepositoryProvider).register(
            finCode: finCode,
            fullName: fullName,
            password: password,
            email: email,
            preferredRegionId: preferredRegionId,
            preferredAreaId: preferredAreaId,
          );
      final user = await ref.read(authRepositoryProvider).me();
      state = AsyncData(user);
      return user;
    } catch (e, st) {
      state = AsyncError(e, st);
      throw Exception(apiErrorMessage(e, fallback: 'Qeydiyyat alınmadı'));
    }
  }

  Future<void> logout() async {
    await ref.read(authRepositoryProvider).logout();
    state = const AsyncData(null);
  }

  Future<void> deleteAccount() async {
    await ref.read(authRepositoryProvider).deleteAccount();
    state = const AsyncData(null);
  }
}

final filterRegionProvider = StateProvider<int?>((ref) => null);
final filterAreaProvider = StateProvider<int?>((ref) => null);
final useNearMeProvider = StateProvider<bool>((ref) => false);
final userLocationProvider = FutureProvider((ref) async {
  return LocationService().currentPosition();
});

final regionsProvider = FutureProvider((ref) => ref.read(catalogRepositoryProvider).regions());

final areasProvider = FutureProvider.family<List<Area>, int>((ref, regionId) {
  return ref.read(catalogRepositoryProvider).areas(regionId);
});

final examsProvider = FutureProvider((ref) async {
  final regionId = ref.watch(filterRegionProvider);
  final areaId = ref.watch(filterAreaProvider);
  final nearMe = ref.watch(useNearMeProvider);
  double? lat;
  double? lng;
  if (nearMe) {
    final pos = await ref.watch(userLocationProvider.future);
    lat = pos?.latitude;
    lng = pos?.longitude;
  }
  return ref.read(catalogRepositoryProvider).exams(
        regionId: regionId,
        areaId: areaId,
        nearLat: lat,
        nearLng: lng,
        radiusKm: nearMe ? 80 : null,
      );
});

final profileProvider = FutureProvider((ref) async {
  final auth = ref.watch(authStateProvider);
  final user = auth.asData?.value;
  if (user == null) {
    throw StateError('Not authenticated');
  }
  return ref.read(portalRepositoryProvider).profile();
});
