# Stack Decision: OMR Answer Sheet

**Date:** 2026-04 · **Project:** imtahansistemi

## Decision

**Extending over the existing stack** is retained: **FastAPI** (backend), **PostgreSQL**, **ReportLab** (PDF), **OMRChecker** (separate service), **Vite + React + TypeScript** (frontend).

The greenfield **Node + Express + react-pdf** monorepo option was **rejected** (migration risk, two parallel backends, doubled PDF/OMR support burden).

## Rationale

| Area | Choice |
|------|--------|
| PDF | ReportLab + Unicode (DejaVu/Arial) TTFont |
| Template | `template_config` JSON + stored `omr_template` |
| Preview | `POST /api/answer-sheets/preview` (PNG, first page) |
| Multi-page | Identity + questions separated: `two_page_pdf` + OMR on MCQ page only |

## Next Steps

- If OMR two-page scanning is required, the worker/processor should be extended to a pipeline that merges both pages.
- Annex API names are not 1:1 with Express; functional equivalents are kept in FastAPI routers.
