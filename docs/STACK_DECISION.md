# Stack qərarı: OMR cavab kartı

**Tarix:** 2026-04 · **Layihə:** imtahansistemi

## Qərar

**Mövcud stack üzərində genişləndirmə** saxlanılır: **FastAPI** (backend), **PostgreSQL**, **ReportLab** (PDF), **OMRChecker** (ayrıca xidmət), **Vite + React + TypeScript** (frontend).

Yaşıl sahə **Node + Express + react-pdf** monorepo variantı **rədd edildi** (migrasiya riski, iki paralel backend, PDF/OMR ikiqat dəstək).

## Əsaslar

| Sahə | Seçim |
|------|--------|
| PDF | ReportLab + Unicode (DejaVu/Arial) TTFont |
| Şablon | `template_config` JSON + saxlanmış `omr_template` |
| Önizləmə | `POST /api/answer-sheets/preview` (PNG, 1-ci səhifə) |
| Çoxsəhifə | İdentifikasiya + suallar ayrılmısı: `two_page_pdf` + OMR yalnız MCQ səhifəsi |

## Sonrakı işlər

- OMR iki səhifə skanı ehtiyacı yaranarsa, işçi/processor hər iki səhifəni birləşdirən axına genişləndirilməlidir.
- Annex API adları Express ilə 1:1 deyil; funksional ekvivalent FastAPI routerlərində saxlanılır.
