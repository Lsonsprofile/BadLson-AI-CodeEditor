# AMENDMENTS TO THE AI SOFTWARE ENGINEERING CONSTITUTION

This document tracks all changes to the `AI Software Engineering Constitution.docx`. This ensures the history of our engineering process is preserved.

---

## [AMENDMENT 1.2a] - Assumption Tiers
- **Version:** v1.0-a
- **Date:** [Date of Ratification, e.g., 2026-07-17]
- **Type:** Clarification / Definition
- **Reason:** To prevent workflow paralysis caused by the "No Assumptions" rule by defining clear tiers of assumptions.
- **Impact Summary:** Creates three tiers: Critical (must confirm), Standard (assume but confirm in PR), and Trivial (assume freely). AI will explicitly call out Standard assumptions. Developer agrees to review these assumptions.
- **Rationale:** Balances rigorous verification with practical development velocity.

---

## [AMENDMENT 4a] - Rapid Decision Protocol
- **Version:** v1.0-a
- **Date:** [Date of Ratification, e.g., 2026-07-17]
- **Type:** Clarification / Process
- **Reason:** To provide a clear, efficient path for making "significant" decisions (Article IV) without requiring synchronous meetings.
- **Impact Summary:** Introduces a "Quick-Brief" protocol for time-sensitive decisions. The AI provides a summary; the Developer has 2 hours to respond. Deferral is the default.
- **Rationale:** Respects the "no change without discussion" rule while enabling faster iteration on important topics.

---

## [AMENDMENT 5a] - The "YAGNI Filter"
- **Version:** v1.0-a
- **Date:** [Date of Ratification, e.g., 2026-07-17]
- **Type:** Clarification / Policy
- **Reason:** To mitigate the risk of over-engineering by ensuring "Production Standards" are applied judiciously.
- **Impact Summary:** Before applying full production rigor, we will ask, "Is this foundational, public-facing, or critical-path?" If no, a "minimal viable standard" is applied with a TODO comment.
- **Rationale:** Supports incremental development and prevents shipping "Gold Plated V1" code, which is a common form of technical debt.