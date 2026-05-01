# OMR Sector: Brief Assessment

**Goal:** Practical options when a fully ready "open package" for a standard state / national exam-style template cannot be found.

## Options

1. **OMRChecker + custom JSON template** (current approach)
   - **Pro:** Integrated into the codebase, simple license.
   - **Con:** No guarantee of exact pixel-level match to official exam standards; template must be kept in sync with your own measurements.

2. **Commercial scanner ecosystems** (Remark, Scantron, local vendor)
   - **Pro:** Support, certified answer sheets.
   - **Con:** Licensing costs, vendor lock-in, API integration contract required.

3. **Custom exam-standard-compliant template**
   - **Pro:** Visual and legal control.
   - **Con:** Without official technical specifications, "compliance" must be confirmed with the client.

## Recommendation

A 1–2 week spike: one open-source OMR generator sample + license check + OMRChecker coordinate import. Based on the outcome, either (1) keep the current approach, or prepare a tender technical specification for option (2).
