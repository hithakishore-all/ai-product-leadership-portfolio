"""Live research agent, tested with a scripted fake of the Anthropic client (no network, no API key).
The fake plays back what Claude would return: web searches, their results, and submit_pack calls."""
import copy
import time
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import app.main as main
from app.research import CRITICAL, run_research

client = TestClient(main.app)
SEGMENTS = [{"id": i, "name": n} for i, n in [("po", "Physical Operations AI"), ("me", "Model Evaluation"), ("as", "Agent Security"),
                                               ("ha", "Healthcare Admin AI"), ("ir", "Robotics Orchestration"), ("dc", "Data Center Energy")]]
URL_A = "https://news.example.com/acme-raises-12m"
URL_B = "https://www.acmerobotics.example/about"


def resp(blocks, stop="tool_use"):
    return SimpleNamespace(content=blocks, stop_reason=stop)


def search_turn(query, urls):
    return [{"type": "server_tool_use", "id": f"srv_{query[:4]}", "name": "web_search", "input": {"query": query}},
            {"type": "web_search_tool_result", "tool_use_id": f"srv_{query[:4]}",
             "content": [{"type": "web_search_result", "url": u, "title": "t", "encrypted_content": "x"} for u in urls]}]


def pack_input(source_url=URL_A, name="Acme Robotics"):
    slug = name.lower().replace(" ", "")
    claims = [{"id": f"{slug}-{k}", "name": n, "value": None, "status": "missing", "critical": True, "note": "Not public."}
              for k, n in CRITICAL if k not in ("raise", "customers")]
    claims += [{"id": f"{slug}-raise", "name": "Series A amount", "value": "$12M", "status": "third", "critical": True, "source": "s1"},
               {"id": f"{slug}-customers", "name": "Named customers", "value": "Northwind", "status": "company", "critical": True, "source": "s2"},
               {"id": f"{slug}-founded", "name": "Founded", "value": "2021", "status": "third", "source": "s2"}]
    return {"sources": [{"id": "s1", "publisher": "Example News", "title": "Acme raises $12M", "url": source_url, "kind": "press"},
                        {"id": "s2", "publisher": "Acme", "title": "About", "url": URL_B, "kind": "company"}],
            "account": {"name": name, "description": "Robot fleet scheduling", "segments": [{"segment_id": "ir", "is_primary": True}]},
            "contacts": [{"name": "Jane Doe", "title": "CEO", "source": "s2"}],
            "funding_rounds": [{"id": f"{slug}-series-a", "stage": "Series A", "quarter": "2026 Q3", "amount_usd_m": 12,
                                "investors": [{"name": "Example Capital", "role": "lead"}], "source": "s1"}],
            "claims": claims}


class FakeClient:
    """Plays back a list of responses and records what was sent."""
    def __init__(self, responses):
        self.responses, self.sent = list(responses), []
        self.messages = SimpleNamespace(create=self._create)

    def _create(self, **kw):
        self.sent.append(copy.deepcopy(kw))
        return self.responses.pop(0)


def happy_script(name="Acme Robotics"):
    return [resp(search_turn("acme robotics funding", [URL_A, URL_B]) +
                 [{"type": "tool_use", "id": "tu1", "name": "submit_pack", "input": pack_input(name=name)}])]


def test_agent_returns_valid_pack_and_reports_progress():
    events = []
    pack = run_research("Acme Robotics", FakeClient(happy_script()), SEGMENTS, on_event=events.append, today="2026-10-31")
    assert pack["account"]["slug"] == "acmerobotics" and pack["is_synthetic"] is False
    assert pack["opportunity"]["stage_name"] == "Identified" and pack["customer_arr"] == []
    assert all(s["retrieved"] == "2026-10-31" for s in pack["sources"])
    assert any(e.startswith("Searching: acme robotics funding") for e in events)
    assert "8 missing" in events[-1]


def test_unsearched_source_is_sent_back_to_the_agent_to_fix():
    fake = FakeClient([
        resp(search_turn("acme", [URL_A, URL_B]) +
             [{"type": "tool_use", "id": "tu1", "name": "submit_pack", "input": pack_input(source_url="https://made-up.example/x")}]),
        resp([{"type": "tool_use", "id": "tu2", "name": "submit_pack", "input": pack_input()}]),
    ])
    pack = run_research("Acme Robotics", fake, SEGMENTS)
    feedback = fake.sent[1]["messages"][-1]["content"][0]
    assert feedback["type"] == "tool_result" and feedback["is_error"] and "made-up.example" in feedback["content"]
    assert pack["sources"][0]["url"] == URL_A


def test_pause_turn_continues_and_invented_numbers_are_rejected():
    bad = pack_input()
    bad["claims"][0]["status"], bad["claims"][0]["value"] = "inferred", "$5M"  # ARR guessed without a source
    fake = FakeClient([resp(search_turn("acme", [URL_A, URL_B]), stop="pause_turn"),
                       resp([{"type": "tool_use", "id": "tu1", "name": "submit_pack", "input": bad}]),
                       resp([{"type": "tool_use", "id": "tu2", "name": "submit_pack", "input": pack_input()}])])
    pack = run_research("Acme Robotics", fake, SEGMENTS)
    assert "needs a source id" in fake.sent[2]["messages"][-1]["content"][0]["content"]
    assert next(c for c in pack["claims"] if c["id"] == "acmerobotics-arr")["status"] == "missing"


def test_gives_up_after_repeated_invalid_packs():
    bad = {"type": "tool_use", "id": "tu", "name": "submit_pack", "input": pack_input(source_url="https://nowhere.example")}
    fake = FakeClient([resp(search_turn("acme", [URL_A, URL_B]) + [bad])] + [resp([bad])] * 5)
    with pytest.raises(RuntimeError, match="could not produce a valid pack"):
        run_research("Acme Robotics", fake, SEGMENTS)


# ---------- API: start a job, poll it, company appears in Company 360 ----------
@pytest.fixture
def db():
    if client.get("/api/health").json()["status"] != "ok":
        pytest.skip("Postgres not reachable")
    client.post("/api/demo/reset")
    yield
    for slug in ("acmerobotics", "helioops"):
        f = main.ROOT / "packs" / f"{slug}.json"
        if slug == "acmerobotics" and f.exists():
            f.unlink()
    client.post("/api/demo/reset")


def poll(job_id):
    for _ in range(50):
        j = client.get(f"/api/research/{job_id}").json()
        if j["status"] != "running":
            return j
        time.sleep(0.05)
    raise AssertionError("job never finished")


def test_research_endpoint_imports_and_saves_the_pack(db, monkeypatch):
    monkeypatch.setattr(main, "research_client", lambda: FakeClient(happy_script()))
    job = client.post("/api/research", json={"company": "Acme Robotics"}).json()
    j = poll(job["job_id"])
    assert j["status"] == "done", j
    assert j["account"] == "acmerobotics" and j["summary"]["claims"] == 11
    prof = client.get("/api/accounts/acmerobotics/profile").json()
    assert prof["coverage"]["ok"] == 2 and prof["coverage"]["total"] == 10
    assert (main.ROOT / "packs" / "acmerobotics.json").exists()


def test_research_needs_a_key_and_never_overwrites_demo_companies(db, monkeypatch):
    monkeypatch.setattr(main, "research_client", lambda: None)
    assert client.post("/api/research", json={"company": "Acme"}).status_code == 503
    monkeypatch.setattr(main, "research_client", lambda: FakeClient(happy_script(name="HelioOps")))
    j = poll(client.post("/api/research", json={"company": "HelioOps"}).json()["job_id"])
    assert j["status"] == "error" and "fictional demo company" in j["error"]
    assert client.get("/api/accounts/helioops/retention").json()["nrr"] == pytest.approx(1.13, abs=0.001)
