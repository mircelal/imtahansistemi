import 'package:latlong2/latlong.dart';

/// Client-side geocode fallback for Azerbaijan (when API coords missing).
class AzGeo {
  static const baku = LatLng(40.4093, 49.8671);
  static const mapCenter = LatLng(40.1431, 47.5769);

  static const Map<String, LatLng> regionCenters = {
    'bakı': baku,
    'baki': baku,
    'abşeron': LatLng(40.45, 49.75),
    'absheron': LatLng(40.45, 49.75),
    'sumqayıt': LatLng(40.5897, 49.6686),
    'gəncə': LatLng(40.6828, 46.3606),
    'gence': LatLng(40.6828, 46.3606),
    'şəki': LatLng(41.1919, 47.1706),
    'seki': LatLng(41.1919, 47.1706),
    'lənkəran': LatLng(38.7543, 48.8512),
    'lenkeran': LatLng(38.7543, 48.8512),
    'quba': LatLng(41.3597, 48.5122),
    'naxçıvan': LatLng(39.2089, 45.4122),
    'naxcivan': LatLng(39.2089, 45.4122),
    'mingəçevir': LatLng(40.7631, 47.0594),
    'şirvan': LatLng(39.9319, 48.9294),
    'yasamal': LatLng(40.3886, 49.8131),
    'nəsimi': LatLng(40.3895, 49.8420),
    'nərimanov': LatLng(40.4035, 49.8705),
    'xətai': LatLng(40.3820, 49.9530),
    'səbail': LatLng(40.3550, 49.8350),
  };

  static LatLng? resolve({
    double? latitude,
    double? longitude,
    String? regionName,
    String? areaName,
    String? city,
    String? venueName,
  }) {
    if (latitude != null && longitude != null) {
      return LatLng(latitude, longitude);
    }
    for (final key in [areaName, city, regionName, venueName]) {
      if (key == null || key.isEmpty) continue;
      final hit = _lookup(key);
      if (hit != null) return hit;
    }
    return null;
  }

  static LatLng? _lookup(String raw) {
    final n = raw.toLowerCase().trim();
    for (final e in regionCenters.entries) {
      if (n.contains(e.key) || e.key.contains(n)) return e.value;
    }
    return null;
  }

  static double? distanceKm(LatLng a, LatLng b) {
    const d = Distance();
    return d.as(LengthUnit.Kilometer, a, b);
  }
}
