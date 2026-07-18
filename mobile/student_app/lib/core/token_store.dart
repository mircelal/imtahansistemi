import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Secure when possible; SharedPreferences fallback (Windows desktop reliability).
class TokenStore {
  TokenStore({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
            );

  final FlutterSecureStorage _storage;
  static const _access = 'access_token';
  static const _refresh = 'refresh_token';

  Future<String?> getAccess() async {
    try {
      final v = await _storage.read(key: _access);
      if (v != null && v.isNotEmpty) return v;
    } catch (e) {
      debugPrint('TokenStore secure read failed: $e');
    }
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_access);
  }

  Future<String?> getRefresh() async {
    try {
      final v = await _storage.read(key: _refresh);
      if (v != null && v.isNotEmpty) return v;
    } catch (_) {}
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_refresh);
  }

  Future<void> save({required String access, String? refresh}) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_access, access);
    if (refresh != null) {
      await prefs.setString(_refresh, refresh);
    }
    try {
      await _storage.write(key: _access, value: access);
      if (refresh != null) {
        await _storage.write(key: _refresh, value: refresh);
      }
    } catch (e) {
      debugPrint('TokenStore secure write failed (prefs used): $e');
    }
  }

  Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_access);
    await prefs.remove(_refresh);
    try {
      await _storage.delete(key: _access);
      await _storage.delete(key: _refresh);
    } catch (_) {}
  }
}
