# BE-6 — Seed corpus

**Status: done. Hand-reviewed by independent subagent (text-quality review, not just structural).**

## What was built

`backend/app/seed_corpus.py` — `SEED_ARTIFACTS: list[Artifact]`, 6 artifacts, each earning its place:

| ID | topic | role |
|---|---|---|
| `seed:policy-deploy-rollback-v2` | deploy-process | Chain step 1 (Policy) |
| `seed:decision-remove-automatic-rollback` | deploy-process | Chain step 2 (Decision) — explicitly "supersedes Deploy Rollback Runbook v2" |
| `seed:incident-plat-412` | deploy-process | Chain step 3 (Incident) — explicitly quotes the decision's full title as cause |
| `seed:policy-leave-v1` | leave-policy | Contradiction, older (`updated_at` 2025-02-01) |
| `seed:policy-leave-v2` | leave-policy | Contradiction, newer (`updated_at` 2025-07-01), same title |
| `seed:decision-onboarding-ownership` | onboarding | Standalone fact, no chain/conflict |

**This is intentionally the exact worked example threaded through both architecture docs** (Deploy Rollback Runbook v2 → June decision → PLAT-412) — not a different invented scenario. Keeping it identical to the docs' own example means BE-9's manual graph inspection, BE-13's Cypher path query, and BE-14's contradiction module all have a known-correct target to validate against, and anyone reading the architecture docs alongside the seed corpus sees the same story.

**Also intentionally aligned with `wireframes.md`'s 3 rehearsed demo-question chips** — don't let these drift apart:
- "Why did PLAT-412 happen?" → the chain.
- "What's our leave policy?" → surfaces the contradiction directly in the answer (this question's answer panel + contradiction banner appearing together is the FE-3 demo moment).
- "Who owns onboarding docs?" → the standalone fact, single clean answer, no chain/conflict noise.

## Design notes for downstream tasks

- **Chain anchors are exact-title-quote or near-exact everywhere on purpose**: the decision's body contains the literal string `"Deploy Rollback Runbook v2"` (the policy's exact title); the incident's body now contains the literal string `"Decision: Remove Automatic Rollback from Deploy Rollback Runbook v2"` (the decision's exact title, in quotes) — this was tightened after independent review flagged the original phrasing as "borderline but fine" (it originally paraphrased the decision as "The June 12, 2025 decision..." instead of quoting the title). **If BE-9's manual graph inspection finds the chain still doesn't resolve cleanly, don't tune Cognee — rewrite the corpus to be even more explicit first**, per the architecture docs' own stated risk mitigation.
- **Contradiction has 3 independent conflicting facts** (day count 15 vs 20, accrual method monthly vs upfront, carryover 5-days vs none) — not just one number, so BE-14's LLM conflict judge has multiple redundant signals.
- All artifacts use `source="seed"` and `url=None` — they come through `SeedFileConnector` (BE-7), not a real external platform. Don't fake a `source="confluence"`/`"jira"` value on these; the UI's source-coverage line is supposed to show "Seed" as its own category.
- `author="People Operations"` is shared across the two leave-policy docs and the onboarding decision — a plausible real-world entity (all three are genuinely HR/People-Ops-owned topics), confirmed during review to not create a spurious cross-topic link with the unrelated deploy-process chain.
- IDs follow `seed:<slug>` (the `source:key` convention from architecture §3's `jira:PLAT-412` example, applied to the seed source).

## For downstream tasks

- **BE-7** (`SeedFileConnector`) consumes `SEED_ARTIFACTS` directly — `fetch(since=None)` should yield all 6; `fetch(since=X)` should filter by `updated_at > since`.
- **BE-9** (blocking gate) — after BE-8 ingests this corpus, manually inspect Neo4j Browser and confirm the SUPERSEDED_BY and CAUSED edges (or Cognee's equivalent relationship types) actually appear between these three specific nodes before writing any Cypher in BE-13.
