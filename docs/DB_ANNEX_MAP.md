# Annex DB sxemi → mövcud modellər

İstinad Annex (templates, answer_keys, sessions, students) ilə bu repodakı uyğunluq.

## Xəritə

| Annex | Mövcud / qeyd |
|--------|----------------|
| `templates.config_json` | `AnswerSheetTemplate.template_config`, `sheet_uuid`, `pdf_path` |
| `answer_keys (template_id, variant, answers_json)` | İmtahan səviyyəsində `AnswerKey` + şablonda `sheet_answer_key` (JSON daxilində) — variantlar üçün ayrıca cədvəl genişləndirilə bilər |
| `sessions` | `Exam`, `ScanSession` (skan sessiyaları) |
| `students` | `ScanResult` və ya gələcək `Participant` — CSV qiymətləndirmə üçün `POST /api/answer-sheets/tools/grade-mcq-csv` müvəqqəti cədvəlsiz hesablayıcıdır |

## Minimal genişləndirmə ideyaları

- `answer_keys` üçün: `exam_id`, `variant_code`, `answers_json` cədvəli əlavə etmək.  
- Toplu nəticə saxlama: `graded_rows` və ya mövcud hesabat cədvəllərinə yazmaq.

Bu sənəd strategiya üçündür; miqrasiya faylları ayrıca taskdır.
