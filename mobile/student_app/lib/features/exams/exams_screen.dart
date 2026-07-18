import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:student_app/core/az_geo.dart';
import 'package:student_app/design/theme.dart';
import 'package:student_app/features/auth/auth_controller.dart';
import 'package:student_app/features/shell/main_shell.dart';

class ExamsScreen extends ConsumerWidget {
  const ExamsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final regions = ref.watch(regionsProvider);
    final regionId = ref.watch(filterRegionProvider);
    final areaId = ref.watch(filterAreaProvider);
    final nearMe = ref.watch(useNearMeProvider);
    final exams = ref.watch(examsProvider);
    final areas = regionId == null ? null : ref.watch(areasProvider(regionId));
    final fmt = DateFormat('dd MMM yyyy · HH:mm', 'az');

    return Scaffold(
      appBar: studentAppBar(
        context,
        'İmtahanlar',
        actions: [
          IconButton(
            tooltip: 'Xəritə',
            onPressed: () => context.go('/map'),
            icon: const Icon(Icons.map_outlined),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: FilterChip(
                        selected: nearMe,
                        avatar: Icon(
                          Icons.near_me_rounded,
                          size: 18,
                          color: nearMe ? Colors.white : AppColors.brand,
                        ),
                        label: const Text('Yaxınımdakılar'),
                        selectedColor: AppColors.brand,
                        checkmarkColor: Colors.white,
                        labelStyle: TextStyle(
                          color: nearMe ? Colors.white : AppColors.ink,
                          fontWeight: FontWeight.w700,
                        ),
                        onSelected: (v) async {
                          ref.read(useNearMeProvider.notifier).state = v;
                          if (v) {
                            ref.invalidate(userLocationProvider);
                            final pos = await ref.read(userLocationProvider.future);
                            if (pos == null && context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(content: Text('GPS aktiv deyil — məkan icazəsini yoxlayın')),
                              );
                              ref.read(useNearMeProvider.notifier).state = false;
                            }
                          }
                        },
                      ),
                    ),
                    const SizedBox(width: 8),
                    TextButton(
                      onPressed: () {
                        ref.read(filterRegionProvider.notifier).state = null;
                        ref.read(filterAreaProvider.notifier).state = null;
                        ref.read(useNearMeProvider.notifier).state = false;
                      },
                      child: const Text('Sıfırla'),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: regions.when(
                        data: (list) => DropdownButtonFormField<int?>(
                          key: ValueKey('reg-$regionId'),
                          initialValue: regionId,
                          isExpanded: true,
                          decoration: const InputDecoration(labelText: 'Bölgə', isDense: true),
                          items: [
                            const DropdownMenuItem(value: null, child: Text('Bütün bölgələr')),
                            ...list.map((r) => DropdownMenuItem(value: r.id, child: Text(r.name))),
                          ],
                          onChanged: (v) {
                            ref.read(filterRegionProvider.notifier).state = v;
                            ref.read(filterAreaProvider.notifier).state = null;
                          },
                        ),
                        loading: () => const LinearProgressIndicator(),
                        error: (_, __) => const SizedBox.shrink(),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: areas == null
                          ? const SizedBox.shrink()
                          : areas.when(
                              data: (list) => DropdownButtonFormField<int?>(
                                key: ValueKey('area-$areaId-$regionId'),
                                initialValue: areaId,
                                isExpanded: true,
                                decoration: const InputDecoration(labelText: 'Ərazi', isDense: true),
                                items: [
                                  const DropdownMenuItem(value: null, child: Text('Hamısı')),
                                  ...list.map((a) => DropdownMenuItem(value: a.id, child: Text(a.name))),
                                ],
                                onChanged: (v) => ref.read(filterAreaProvider.notifier).state = v,
                              ),
                              loading: () => const SizedBox.shrink(),
                              error: (_, __) => const SizedBox.shrink(),
                            ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          Expanded(
            child: exams.when(
              data: (list) {
                if (list.isEmpty) {
                  return const Center(
                    child: Padding(
                      padding: EdgeInsets.all(32),
                      child: Text(
                        'Bu filtr üzrə açıq imtahan yoxdur.\nBaşqa bölgə seçin və ya xəritədən baxın.',
                        textAlign: TextAlign.center,
                      ),
                    ),
                  );
                }
                return ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 28),
                  itemCount: list.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 12),
                  itemBuilder: (context, i) {
                    final e = list[i];
                    final price = e.minTicketPrice ?? e.listPriceAmount;
                    final place = [e.venueName ?? e.city, e.areaName, e.regionName]
                        .whereType<String>()
                        .where((s) => s.isNotEmpty)
                        .join(' · ');
                    final myLoc = ref.watch(userLocationProvider).asData?.value;
                    final point = AzGeo.resolve(
                      latitude: e.latitude,
                      longitude: e.longitude,
                      regionName: e.regionName,
                      areaName: e.areaName,
                      city: e.city,
                    );
                    final dist = e.distanceKm ??
                        (myLoc != null && point != null ? AzGeo.distanceKm(myLoc, point) : null);

                    return Material(
                      color: AppColors.card,
                      borderRadius: BorderRadius.circular(20),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(20),
                        onTap: () => context.push('/exams/${e.id}'),
                        child: Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: AppColors.line),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                    decoration: BoxDecoration(
                                      color: e.lifecycleStatus == 'live'
                                          ? AppColors.success.withValues(alpha: 0.12)
                                          : AppColors.accentSoft,
                                      borderRadius: BorderRadius.circular(999),
                                    ),
                                    child: Text(
                                      e.lifecycleStatus == 'live' ? 'Qeydiyyat açıq' : 'Yaxınlaşır',
                                      style: TextStyle(
                                        color: e.lifecycleStatus == 'live'
                                            ? AppColors.success
                                            : const Color(0xFF8A6A00),
                                        fontWeight: FontWeight.w700,
                                        fontSize: 12,
                                      ),
                                    ),
                                  ),
                                  if (e.examCategory != null) ...[
                                    const SizedBox(width: 8),
                                    Text(
                                      e.examCategory!.toUpperCase(),
                                      style: const TextStyle(
                                        color: AppColors.muted,
                                        fontSize: 11,
                                        fontWeight: FontWeight.w700,
                                        letterSpacing: 0.6,
                                      ),
                                    ),
                                  ],
                                  const Spacer(),
                                  if (price != null)
                                    Text(
                                      '${price.toStringAsFixed(0)} ${e.listPriceCurrency}',
                                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                                    ),
                                ],
                              ),
                              const SizedBox(height: 10),
                              Text(
                                e.title,
                                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                      fontWeight: FontWeight.w800,
                                      letterSpacing: -0.2,
                                    ),
                              ),
                              if (e.scheduledAt != null) ...[
                                const SizedBox(height: 6),
                                Row(
                                  children: [
                                    const Icon(Icons.schedule, size: 16, color: AppColors.muted),
                                    const SizedBox(width: 6),
                                    Text(
                                      fmt.format(e.scheduledAt!.toLocal()),
                                      style: const TextStyle(color: AppColors.muted),
                                    ),
                                  ],
                                ),
                              ],
                              if (place.isNotEmpty) ...[
                                const SizedBox(height: 4),
                                Row(
                                  children: [
                                    const Icon(Icons.place_outlined, size: 16, color: AppColors.muted),
                                    const SizedBox(width: 6),
                                    Expanded(
                                      child: Text(place, style: const TextStyle(color: AppColors.muted)),
                                    ),
                                  ],
                                ),
                              ],
                              if (dist != null) ...[
                                const SizedBox(height: 6),
                                Text(
                                  '≈ ${dist.toStringAsFixed(1)} km məsafədə',
                                  style: const TextStyle(
                                    color: AppColors.info,
                                    fontWeight: FontWeight.w600,
                                    fontSize: 13,
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                    ).animate().fadeIn(duration: 280.ms, delay: (40 * i).ms).slideY(begin: 0.06, end: 0);
                  },
                );
              },
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('Xəta: $e')),
            ),
          ),
        ],
      ),
    );
  }
}
