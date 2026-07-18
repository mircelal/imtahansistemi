import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:latlong2/latlong.dart';
import 'package:student_app/core/az_geo.dart';
import 'package:student_app/core/models.dart';
import 'package:student_app/design/theme.dart';
import 'package:student_app/features/auth/auth_controller.dart';
import 'package:student_app/features/shell/main_shell.dart';

class ExamsMapScreen extends ConsumerStatefulWidget {
  const ExamsMapScreen({super.key});

  @override
  ConsumerState<ExamsMapScreen> createState() => _ExamsMapScreenState();
}

class _ExamsMapScreenState extends ConsumerState<ExamsMapScreen> {
  final _mapController = MapController();
  CatalogExam? _selected;
  bool _locating = false;

  Future<void> _goToMe() async {
    setState(() => _locating = true);
    ref.read(useNearMeProvider.notifier).state = true;
    ref.invalidate(userLocationProvider);
    final pos = await ref.read(userLocationProvider.future);
    setState(() => _locating = false);
    if (pos == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('GPS icazəsi və ya siqnal yoxdur. Parametrlərdən məkanı açın.')),
        );
      }
      return;
    }
    _mapController.move(pos, 12.5);
  }

  LatLng _pointFor(CatalogExam e) {
    return AzGeo.resolve(
          latitude: e.latitude,
          longitude: e.longitude,
          regionName: e.regionName,
          areaName: e.areaName,
          city: e.city,
          venueName: e.venueName,
        ) ??
        AzGeo.baku;
  }

  @override
  Widget build(BuildContext context) {
    final exams = ref.watch(examsProvider);
    final myLoc = ref.watch(userLocationProvider);
    final fmt = DateFormat('dd MMM, HH:mm', 'az');

    return Scaffold(
      appBar: studentAppBar(context, 'Xəritə'),
      body: exams.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Xəritə yüklənmədi: $e')),
        data: (list) {
          final markers = <Marker>[
            ...list.map((e) {
              final p = _pointFor(e);
              final selected = _selected?.id == e.id;
              return Marker(
                point: p,
                width: selected ? 56 : 44,
                height: selected ? 56 : 44,
                child: GestureDetector(
                  onTap: () => setState(() => _selected = e),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 220),
                    decoration: BoxDecoration(
                      color: selected ? AppColors.brand : AppColors.mapPin,
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 2.5),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.2),
                          blurRadius: 8,
                          offset: const Offset(0, 3),
                        ),
                      ],
                    ),
                    child: Icon(
                      Icons.school_rounded,
                      color: Colors.white,
                      size: selected ? 24 : 18,
                    ),
                  ),
                ),
              );
            }),
            if (myLoc.asData?.value != null)
              Marker(
                point: myLoc.asData!.value!,
                width: 40,
                height: 40,
                child: Container(
                  decoration: BoxDecoration(
                    color: AppColors.info,
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 3),
                  ),
                  child: const Icon(Icons.my_location, color: Colors.white, size: 18),
                ),
              ),
          ];

          return Stack(
            children: [
              FlutterMap(
                mapController: _mapController,
                options: MapOptions(
                  initialCenter: myLoc.asData?.value ?? AzGeo.mapCenter,
                  initialZoom: 7.2,
                  minZoom: 5.5,
                  maxZoom: 17,
                  onTap: (_, __) => setState(() => _selected = null),
                ),
                children: [
                  TileLayer(
                    urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                    userAgentPackageName: 'az.imtahansistemi.student_app',
                  ),
                  MarkerLayer(markers: markers),
                ],
              ),
              Positioned(
                top: 12,
                left: 12,
                right: 12,
                child: Material(
                  color: Colors.white.withValues(alpha: 0.95),
                  elevation: 2,
                  borderRadius: BorderRadius.circular(16),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    child: Row(
                      children: [
                        const Icon(Icons.map_outlined, color: AppColors.brand),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            list.isEmpty
                                ? 'Açıq imtahan mərkəzi yoxdur'
                                : '${list.length} imtahan mərkəzi · pinə toxunun',
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              Positioned(
                right: 14,
                bottom: _selected == null ? 24 : 210,
                child: Column(
                  children: [
                    FloatingActionButton.small(
                      heroTag: 'gps',
                      backgroundColor: Colors.white,
                      foregroundColor: AppColors.brand,
                      onPressed: _locating ? null : _goToMe,
                      child: _locating
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.my_location),
                    ),
                    const SizedBox(height: 8),
                    FloatingActionButton.small(
                      heroTag: 'list',
                      backgroundColor: AppColors.brand,
                      foregroundColor: Colors.white,
                      onPressed: () => context.go('/exams'),
                      child: const Icon(Icons.view_list_rounded),
                    ),
                  ],
                ),
              ),
              if (_selected != null)
                Positioned(
                  left: 12,
                  right: 12,
                  bottom: 16,
                  child: _ExamMapCard(
                    exam: _selected!,
                    dateLabel: _selected!.scheduledAt != null
                        ? fmt.format(_selected!.scheduledAt!.toLocal())
                        : 'Tarix açıqlanacaq',
                    onOpen: () => context.push('/exams/${_selected!.id}'),
                    onClose: () => setState(() => _selected = null),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _ExamMapCard extends StatelessWidget {
  const _ExamMapCard({
    required this.exam,
    required this.dateLabel,
    required this.onOpen,
    required this.onClose,
  });

  final CatalogExam exam;
  final String dateLabel;
  final VoidCallback onOpen;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final place = [exam.venueName ?? exam.city, exam.areaName, exam.regionName]
        .whereType<String>()
        .where((e) => e.isNotEmpty)
        .join(' · ');
    final price = exam.minTicketPrice ?? exam.listPriceAmount;

    return Material(
      color: Colors.white,
      elevation: 8,
      shadowColor: Colors.black26,
      borderRadius: BorderRadius.circular(22),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 12, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.brandSoft,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    exam.lifecycleStatus == 'live' ? 'Canlı qeydiyyat' : 'Planlaşdırılıb',
                    style: const TextStyle(
                      color: AppColors.brand,
                      fontWeight: FontWeight.w700,
                      fontSize: 12,
                    ),
                  ),
                ),
                const Spacer(),
                IconButton(onPressed: onClose, icon: const Icon(Icons.close, size: 20)),
              ],
            ),
            Text(
              exam.title,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 4),
            Text(dateLabel, style: const TextStyle(color: AppColors.muted)),
            if (place.isNotEmpty) ...[
              const SizedBox(height: 2),
              Text(place, style: const TextStyle(color: AppColors.muted, fontSize: 13)),
            ],
            if (exam.distanceKm != null) ...[
              const SizedBox(height: 4),
              Text(
                'Sizdən ~${exam.distanceKm!.toStringAsFixed(1)} km',
                style: const TextStyle(color: AppColors.info, fontWeight: FontWeight.w600, fontSize: 13),
              ),
            ],
            const SizedBox(height: 12),
            Row(
              children: [
                if (price != null)
                  Text(
                    '${price.toStringAsFixed(0)} ${exam.listPriceCurrency}',
                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18),
                  ),
                const Spacer(),
                FilledButton(
                  onPressed: onOpen,
                  child: const Text('Detallar və bilet'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
