from datetime import datetime, timezone

from app.seed_connector import SeedFileConnector
from app.seed_corpus import SEED_ARTIFACTS


def test_fetch_none_yields_all_artifacts():
    connector = SeedFileConnector()
    result = list(connector.fetch(None))
    assert len(result) == len(SEED_ARTIFACTS)
    assert {a.id for a in result} == {a.id for a in SEED_ARTIFACTS}


def test_fetch_all_results_are_valid_artifacts():
    connector = SeedFileConnector()
    for artifact in connector.fetch(None):
        assert isinstance(artifact.id, str) and artifact.id
        assert isinstance(artifact.source, str) and artifact.source
        assert isinstance(artifact.title, str) and artifact.title
        assert isinstance(artifact.body, str) and artifact.body
        assert artifact.created_at.tzinfo is not None
        assert artifact.updated_at.tzinfo is not None


def test_fetch_since_filters_by_updated_at():
    connector = SeedFileConnector()
    # Between the leave-policy contradiction's two updated_at dates
    # (2025-02-01 and 2025-07-01) — should only return the newer one plus
    # anything else updated after that cutoff.
    cutoff = datetime(2025, 6, 15, tzinfo=timezone.utc)
    result = list(connector.fetch(cutoff))
    ids = {a.id for a in result}
    assert "seed:policy-leave-v2" in ids  # updated 2025-07-01, after cutoff
    assert "seed:policy-leave-v1" not in ids  # updated 2025-02-01, before cutoff
    assert all(a.updated_at > cutoff for a in result)


def test_fetch_since_far_future_yields_nothing():
    connector = SeedFileConnector()
    result = list(connector.fetch(datetime(2099, 1, 1, tzinfo=timezone.utc)))
    assert result == []


def test_name_attribute_matches_source():
    connector = SeedFileConnector()
    assert connector.name == "seed"
    assert all(a.source == connector.name for a in connector.fetch(None))
