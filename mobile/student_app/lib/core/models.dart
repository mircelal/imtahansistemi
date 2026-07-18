class AuthTokens {
  AuthTokens({required this.accessToken, this.refreshToken, this.expiresIn});

  final String accessToken;
  final String? refreshToken;
  final int? expiresIn;

  factory AuthTokens.fromJson(Map<String, dynamic> j) => AuthTokens(
        accessToken: j['access_token'] as String,
        refreshToken: j['refresh_token'] as String?,
        expiresIn: j['expires_in'] as int?,
      );
}

class UserMe {
  UserMe({
    required this.id,
    required this.email,
    required this.fullName,
    required this.role,
    this.finCode,
    this.phone,
    this.preferredRegionId,
    this.preferredAreaId,
    this.linkedStudentId,
    this.hasAvatar = false,
    this.bio,
    this.schoolName,
    this.gradeLabel,
  });

  final int id;
  final String email;
  final String fullName;
  final String role;
  final String? finCode;
  final String? phone;
  final int? preferredRegionId;
  final int? preferredAreaId;
  final int? linkedStudentId;
  final bool hasAvatar;
  final String? bio;
  final String? schoolName;
  final String? gradeLabel;

  factory UserMe.fromJson(Map<String, dynamic> j) => UserMe(
        id: j['id'] as int,
        email: j['email'] as String,
        fullName: j['full_name'] as String,
        role: j['role'] as String,
        finCode: j['fin_code'] as String?,
        phone: j['phone'] as String?,
        preferredRegionId: j['preferred_region_id'] as int?,
        preferredAreaId: j['preferred_area_id'] as int?,
        linkedStudentId: j['linked_student_id'] as int?,
        hasAvatar: (j['has_avatar'] as bool?) ?? false,
        bio: j['bio'] as String?,
        schoolName: j['school_name'] as String?,
        gradeLabel: j['grade_label'] as String?,
      );
}

class Region {
  Region({required this.id, required this.name, required this.slug, this.latitude, this.longitude});
  final int id;
  final String name;
  final String slug;
  final double? latitude;
  final double? longitude;
  factory Region.fromJson(Map<String, dynamic> j) => Region(
        id: j['id'] as int,
        name: j['name'] as String,
        slug: j['slug'] as String,
        latitude: (j['latitude'] as num?)?.toDouble(),
        longitude: (j['longitude'] as num?)?.toDouble(),
      );
}

class Area {
  Area({required this.id, required this.regionId, required this.name});
  final int id;
  final int regionId;
  final String name;
  factory Area.fromJson(Map<String, dynamic> j) => Area(
        id: j['id'] as int,
        regionId: j['region_id'] as int,
        name: j['name'] as String,
      );
}

class CatalogExam {
  CatalogExam({
    required this.id,
    required this.title,
    this.description,
    this.scheduledAt,
    this.lifecycleStatus,
    this.regionName,
    this.areaName,
    this.venueName,
    this.city,
    this.minTicketPrice,
    this.listPriceAmount,
    this.listPriceCurrency = 'AZN',
    this.ticketsAvailable = 0,
    this.latitude,
    this.longitude,
    this.distanceKm,
    this.examCategory,
  });

  final int id;
  final String title;
  final String? description;
  final DateTime? scheduledAt;
  final String? lifecycleStatus;
  final String? regionName;
  final String? areaName;
  final String? venueName;
  final String? city;
  final double? minTicketPrice;
  final double? listPriceAmount;
  final String listPriceCurrency;
  final int ticketsAvailable;
  final double? latitude;
  final double? longitude;
  final double? distanceKm;
  final String? examCategory;

  factory CatalogExam.fromJson(Map<String, dynamic> j) => CatalogExam(
        id: j['id'] as int,
        title: j['title'] as String,
        description: j['description'] as String?,
        scheduledAt: j['scheduled_at'] != null ? DateTime.tryParse(j['scheduled_at'] as String) : null,
        lifecycleStatus: j['lifecycle_status'] as String?,
        regionName: j['region_name'] as String?,
        areaName: j['area_name'] as String?,
        venueName: j['venue_name'] as String?,
        city: j['city'] as String?,
        minTicketPrice: (j['min_ticket_price'] as num?)?.toDouble(),
        listPriceAmount: (j['list_price_amount'] as num?)?.toDouble(),
        listPriceCurrency: (j['list_price_currency'] as String?) ?? 'AZN',
        ticketsAvailable: (j['tickets_available'] as int?) ?? 0,
        latitude: (j['latitude'] as num?)?.toDouble(),
        longitude: (j['longitude'] as num?)?.toDouble(),
        distanceKm: (j['distance_km'] as num?)?.toDouble(),
        examCategory: j['exam_category'] as String?,
      );
}

class CatalogTicket {
  CatalogTicket({
    required this.id,
    required this.title,
    required this.priceAmount,
    required this.currency,
    this.remainingQuota,
    this.saleStatus,
  });

  final int id;
  final String title;
  final double priceAmount;
  final String currency;
  final int? remainingQuota;
  final String? saleStatus;

  factory CatalogTicket.fromJson(Map<String, dynamic> j) => CatalogTicket(
        id: j['id'] as int,
        title: j['title'] as String,
        priceAmount: (j['price_amount'] as num).toDouble(),
        currency: (j['currency'] as String?) ?? 'AZN',
        remainingQuota: j['remaining_quota'] as int?,
        saleStatus: j['sale_status'] as String?,
      );
}

class ExamDetail extends CatalogExam {
  ExamDetail({
    required super.id,
    required super.title,
    super.description,
    super.scheduledAt,
    super.lifecycleStatus,
    super.regionName,
    super.areaName,
    super.venueName,
    super.city,
    super.minTicketPrice,
    super.listPriceAmount,
    super.listPriceCurrency,
    super.ticketsAvailable,
    super.latitude,
    super.longitude,
    super.distanceKm,
    super.examCategory,
    required this.tickets,
  });

  final List<CatalogTicket> tickets;

  factory ExamDetail.fromJson(Map<String, dynamic> j) {
    final base = CatalogExam.fromJson(j);
    final tickets = ((j['tickets'] as List?) ?? [])
        .map((e) => CatalogTicket.fromJson(e as Map<String, dynamic>))
        .toList();
    return ExamDetail(
      id: base.id,
      title: base.title,
      description: base.description,
      scheduledAt: base.scheduledAt,
      lifecycleStatus: base.lifecycleStatus,
      regionName: base.regionName,
      areaName: base.areaName,
      venueName: base.venueName,
      city: base.city,
      minTicketPrice: base.minTicketPrice,
      listPriceAmount: base.listPriceAmount,
      listPriceCurrency: base.listPriceCurrency,
      ticketsAvailable: base.ticketsAvailable,
      latitude: base.latitude,
      longitude: base.longitude,
      distanceKm: base.distanceKm,
      examCategory: base.examCategory,
      tickets: tickets,
    );
  }
}

class CheckoutResult {
  CheckoutResult({required this.checkoutUrl, required this.publicId, required this.driver});
  final String checkoutUrl;
  final String publicId;
  final String driver;

  factory CheckoutResult.fromJson(Map<String, dynamic> j) => CheckoutResult(
        checkoutUrl: j['checkout_url'] as String,
        publicId: (j['intent'] as Map)['public_id'] as String,
        driver: j['driver'] as String,
      );
}

class Registration {
  Registration({
    required this.orderId,
    required this.ticketTitle,
    required this.status,
    this.examTitle,
    this.examId,
    this.scheduledAt,
    this.venueLabel,
    this.city,
    this.admitQrPayload,
    this.hasResult = false,
  });

  final int orderId;
  final String ticketTitle;
  final String status;
  final String? examTitle;
  final int? examId;
  final DateTime? scheduledAt;
  final String? venueLabel;
  final String? city;
  final String? admitQrPayload;
  final bool hasResult;

  factory Registration.fromJson(Map<String, dynamic> j) => Registration(
        orderId: j['order_id'] as int,
        ticketTitle: j['ticket_title'] as String,
        status: j['status'] as String,
        examTitle: j['exam_title'] as String?,
        examId: j['exam_id'] as int?,
        scheduledAt: j['scheduled_at'] != null ? DateTime.tryParse(j['scheduled_at'] as String) : null,
        venueLabel: j['venue_label'] as String?,
        city: j['city'] as String?,
        admitQrPayload: j['admit_qr_payload'] as String?,
        hasResult: (j['has_result'] as bool?) ?? false,
      );
}

class StudentProfile {
  StudentProfile({
    required this.fullName,
    required this.email,
    this.finCode,
    this.phone,
    this.hasAvatar = false,
    this.bio,
    this.schoolName,
    this.gradeLabel,
    this.averagePercent,
    this.performanceBand,
    required this.registrations,
    required this.results,
    required this.insights,
    this.preferredRegionId,
    this.preferredAreaId,
  });

  final String fullName;
  final String email;
  final String? finCode;
  final String? phone;
  final bool hasAvatar;
  final String? bio;
  final String? schoolName;
  final String? gradeLabel;
  final double? averagePercent;
  final String? performanceBand;
  final List<Registration> registrations;
  final List<Map<String, dynamic>> results;
  final List<Map<String, dynamic>> insights;
  final int? preferredRegionId;
  final int? preferredAreaId;

  factory StudentProfile.fromJson(Map<String, dynamic> j) {
    final account = j['account'] as Map<String, dynamic>;
    final stats = j['stats'] as Map<String, dynamic>? ?? {};
    final analytics = j['analytics'] as Map<String, dynamic>? ?? {};
    return StudentProfile(
      fullName: account['full_name'] as String? ?? '',
      email: account['email'] as String? ?? '',
      finCode: account['fin_code'] as String?,
      phone: account['phone'] as String?,
      hasAvatar: (account['has_avatar'] as bool?) ?? false,
      bio: account['bio'] as String?,
      schoolName: account['school_name'] as String?,
      gradeLabel: account['grade_label'] as String?,
      preferredRegionId: account['preferred_region_id'] as int?,
      preferredAreaId: account['preferred_area_id'] as int?,
      averagePercent: (stats['average_percent'] as num?)?.toDouble(),
      performanceBand: analytics['performance_band'] as String?,
      registrations: ((j['registrations'] as List?) ?? [])
          .map((e) => Registration.fromJson(e as Map<String, dynamic>))
          .toList(),
      results: ((j['results'] as List?) ?? []).cast<Map<String, dynamic>>(),
      insights: ((analytics['insights'] as List?) ?? []).cast<Map<String, dynamic>>(),
    );
  }
}
