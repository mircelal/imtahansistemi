# Annex DB Schema → Existing Models

Mapping between the reference Annex schema (templates, answer_keys, sessions, students) and the models in this repository.

## Map

| Annex | Existing / Notes |
|-------|------------------|
| `templates.config_json` | `AnswerSheetTemplate.template_config`, `sheet_uuid`, `pdf_path` |
| `answer_keys (template_id, variant, answers_json)` | Exam-level `AnswerKey` + `sheet_answer_key` inside the template (as JSON) — a separate table for variants can be added as an extension |
| `sessions` | `Exam`, `ScanSession` (scan sessions) |
| `students` | `ScanResult` or a future `Participant` — `POST /api/answer-sheets/tools/grade-mcq-csv` is a temporary table-less calculator for CSV grading |

## Minimal Extension Ideas

- For `answer_keys`: add a table with `exam_id`, `variant_code`, `answers_json`.
- Bulk result storage: write to `graded_rows` or the existing report tables.

This document is for strategy purposes; migration files are a separate task.
