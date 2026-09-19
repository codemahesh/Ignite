"""BE-6: deliberate seed corpus.

Six artifacts, each earning its place — no "realistic filler" (per the task's
own instruction). Two structures are planted on purpose:

1. A real multi-hop chain, Policy -> Decision -> Incident, matching the
   worked example threaded through both architecture docs:
   Deploy Rollback Runbook v2 --[SUPERSEDED_BY]--> the June decision
   --[CAUSED]--> Incident PLAT-412. Each doc names the other by exact title
   text ("Deploy Rollback Runbook v2") so Cognee's extraction has an
   unambiguous anchor to link on — see BE-9's gate before assuming this
   resolved correctly in the real graph.
2. A real date-based contradiction: two artifacts sharing the exact same
   title ("Employee Leave Policy") and topic, with different `updated_at`
   and three distinct conflicting facts (day count, accrual method,
   carryover) — not a single ambiguous number, so the LLM conflict judge
   (BE-14) has multiple independent signals to catch.

The remaining artifact (onboarding ownership) is a plain single-fact doc —
answers the third rehearsed demo question with no chain or conflict
involved, matching the three chips already sketched in wireframes.md
("Why did PLAT-412 happen?", "What's our leave policy?",
"Who owns onboarding docs?").

All six use `source="seed"` (they come through SeedFileConnector, BE-7 — not
a real Confluence/Jira sync) and artifact IDs follow the project's
`source:key` convention (matches the architecture doc's own `jira:PLAT-412`
example).
"""

from datetime import datetime, timezone

from app.artifact import Artifact


def _dt(y: int, m: int, d: int) -> datetime:
    return datetime(y, m, d, tzinfo=timezone.utc)


SEED_ARTIFACTS: list[Artifact] = [
    # --- Chain: Policy -> Decision -> Incident (topic: deploy-process) ---
    Artifact(
        id="seed:policy-deploy-rollback-v2",
        source="seed",
        type="policy",
        title="Deploy Rollback Runbook v2",
        body=(
            "When a production deploy to the platform service fails health checks "
            "within 5 minutes of rollout, the deploy pipeline automatically triggers "
            "a rollback to the previous stable release. On-call engineers do not need "
            "to intervene manually for the automatic rollback to occur. This runbook "
            "has been the standard rollback procedure for the platform service since "
            "January 2025."
        ),
        author="Priya Nair",
        created_at=_dt(2025, 1, 10),
        updated_at=_dt(2025, 3, 4),
        url=None,
        topic="deploy-process",
    ),
    Artifact(
        id="seed:decision-remove-automatic-rollback",
        source="seed",
        type="decision",
        title="Decision: Remove Automatic Rollback from Deploy Rollback Runbook v2",
        body=(
            "Effective June 12, 2025, this decision replaces Deploy Rollback Runbook "
            "v2 with Deploy Rollback Runbook v3 for the platform service. The "
            "automatic rollback step described in Deploy Rollback Runbook v2 is "
            "removed because it was triggering unnecessary rollbacks during brief "
            "health-check flakiness, which caused service flapping. Under the new "
            "procedure, a failed health check now pages the on-call engineer, who "
            "must manually confirm and trigger any rollback. This decision supersedes "
            "Deploy Rollback Runbook v2 for the platform service."
        ),
        author="Marcus Ihejirika",
        created_at=_dt(2025, 6, 12),
        updated_at=_dt(2025, 6, 12),
        url=None,
        topic="deploy-process",
    ),
    Artifact(
        id="seed:incident-plat-412",
        source="seed",
        type="ticket",
        title="Incident PLAT-412: Platform service outage during deploy",
        body=(
            "On June 14, 2025, a platform service deploy failed its health checks "
            "and the service was down for 22 minutes before the on-call engineer "
            "noticed the page and manually triggered a rollback. Under the automatic "
            "rollback step that existed in Deploy Rollback Runbook v2, this deploy "
            "would have been rolled back within 5 minutes without any manual "
            "intervention. The 'Decision: Remove Automatic Rollback from Deploy "
            "Rollback Runbook v2' (June 12, 2025) is the direct cause of this "
            "incident's extended downtime."
        ),
        author="Priya Nair",
        created_at=_dt(2025, 6, 14),
        updated_at=_dt(2025, 6, 14),
        url=None,
        topic="deploy-process",
    ),
    # --- Contradiction: two same-topic, same-title docs, different dates ---
    Artifact(
        id="seed:policy-leave-v1",
        source="seed",
        type="policy",
        title="Employee Leave Policy",
        body=(
            "Employees are entitled to 15 days of paid annual leave per calendar "
            "year. Leave accrues monthly at a rate of 1.25 days per month worked, "
            "and unused leave carries over up to 5 days into the following year."
        ),
        author="People Operations",
        created_at=_dt(2024, 1, 1),
        updated_at=_dt(2025, 2, 1),
        url=None,
        topic="leave-policy",
    ),
    Artifact(
        id="seed:policy-leave-v2",
        source="seed",
        type="policy",
        title="Employee Leave Policy",
        body=(
            "Employees are entitled to 20 days of paid annual leave per calendar "
            "year. The full annual allotment is credited on January 1st each year "
            "rather than accruing monthly, and unused leave does not carry over to "
            "the following year."
        ),
        author="People Operations",
        created_at=_dt(2025, 7, 1),
        updated_at=_dt(2025, 7, 1),
        url=None,
        topic="leave-policy",
    ),
    # --- Standalone fact, no chain/conflict (topic: onboarding) ---
    Artifact(
        id="seed:decision-onboarding-ownership",
        source="seed",
        type="decision",
        title="Decision: Onboarding Documentation Ownership",
        body=(
            "The People Operations team owns and maintains all onboarding "
            "documentation for new hires. Engineering managers who need an "
            "onboarding doc updated must submit the request through the "
            "#onboarding-docs Slack channel rather than editing the documents "
            "directly."
        ),
        author="People Operations",
        created_at=_dt(2025, 4, 20),
        updated_at=_dt(2025, 4, 20),
        url=None,
        topic="onboarding",
    ),
]
