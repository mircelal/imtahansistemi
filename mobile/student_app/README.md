# Şagird mobil app (Flutter)

Enterprise şagird kabineti: FIN/email auth, bölgə/ərazi imtahan kataloqu, ödəniş, admit QR, nəticələr.

## API (REST)

Default origin: **`https://bilik.sayt.cam`**

Bütün endpointlər REST qaydasındadır:

| Method | Path | Təsvir |
|--------|------|--------|
| `POST` | `/api/auth/register-student` | Qeydiyyat |
| `POST` | `/api/auth/login` | Giriş (FIN və ya email) |
| `POST` | `/api/auth/refresh` | Token yeniləmə |
| `GET` | `/api/auth/me` | Cari istifadəçi |
| `GET` | `/api/regions` | Bölgələr |
| `GET` | `/api/regions/{id}/areas` | Ərazilər |
| `GET` | `/api/student/exams` | İmtahan kataloqu |
| `POST` | `/api/student/tickets/{id}/checkout` | Bilet ödənişi |
| `GET` | `/api/me/student` | Kabinet / nəticələr |

## Quraşdırma

```bash
cd mobile/student_app
flutter pub get

# Production (default)
flutter run -d windows

# Başqa origin
flutter run --dart-define=API_BASE=https://bilik.sayt.cam
```

Lokal backend üçün: `--dart-define=API_BASE=http://127.0.0.1:8000`

## Deep link

`imtahansistemi://payments/return?intent=<public_id>&paid=1`
