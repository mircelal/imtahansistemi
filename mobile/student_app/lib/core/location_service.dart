import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

class LocationService {
  Future<bool> ensurePermission() async {
    final service = await Geolocator.isLocationServiceEnabled();
    if (!service) return false;
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.deniedForever || permission == LocationPermission.denied) {
      return false;
    }
    return true;
  }

  Future<LatLng?> currentPosition() async {
    try {
      final ok = await ensurePermission();
      if (!ok) return null;
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 12),
        ),
      );
      return LatLng(pos.latitude, pos.longitude);
    } on PlatformException {
      return null;
    } catch (_) {
      return null;
    }
  }
}
