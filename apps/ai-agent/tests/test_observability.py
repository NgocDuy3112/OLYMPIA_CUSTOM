from app.observability import flush, is_enabled, setup


def test_disabled_when_no_endpoint(monkeypatch):
    monkeypatch.delenv("PHOENIX_COLLECTOR_ENDPOINT", raising=False)
    assert is_enabled() is False
    setup()
    flush()


def test_enabled_by_collector_endpoint(monkeypatch):
    monkeypatch.setenv("PHOENIX_COLLECTOR_ENDPOINT", "http://localhost:6006")
    assert is_enabled() is True


def test_setup_idempotent_when_disabled(monkeypatch):
    monkeypatch.delenv("PHOENIX_COLLECTOR_ENDPOINT", raising=False)
    setup()
    setup()
    flush()
