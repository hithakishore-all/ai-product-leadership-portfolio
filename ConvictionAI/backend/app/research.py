"""Live company research: a Claude agent with web search turns a company name into a company pack.

    run_research(company, client, segments, on_event) -> pack dict (already validated)

How it works
1. Claude searches the web (Anthropic's server-side web_search tool) and reads the results.
2. It hands back its findings by calling one tool, submit_pack, whose input is a company pack.
3. The pack goes through the same validator as hand-made packs (packs.validate), plus one extra
   rule: every source URL must be a page that actually came back from a search in this session.
   If anything fails, the problems go back to Claude to fix (up to MAX_FIX_ROUNDS times).
4. The caller imports the pack (packs.import_pack). The model never computes metrics; anything
   not public stays `missing`.

Configure with ANTHROPIC_API_KEY (required) and RESEARCH_MODEL (optional) in .env.
"""
import datetime as dt
import json
import os
from typing import Callable, Dict, List, Optional

from .packs import STAGES, STATUSES, slugify, validate

DEFAULT_MODEL = "claude-sonnet-5-5"
MAX_SEARCHES = 12
MAX_TURNS = 12
MAX_FIX_ROUNDS = 3

CRITICAL = [
    ("arr", "ARR"), ("nrr", "Net revenue retention"), ("grr", "Gross revenue retention"), ("gm", "Gross margin"),
    ("burn", "Cash and monthly burn"), ("conc", "Largest customer share of ARR"),
    ("raise", "Latest round amount (local currency)"), ("raise-usd", "Latest round amount in USD"),
    ("customers", "Named customers"), ("impact", "Customer outcomes"),
]

SUBMIT_TOOL = {
    "name": "submit_pack",
    "description": "Submit the finished company pack. Call this exactly once, when research is complete. "
                   "If it returns problems, fix them and call it again.",
    "input_schema": {
        "type": "object",
        "required": ["sources", "account", "claims"],
        "properties": {
            "sources": {"type": "array", "items": {"type": "object", "required": ["id", "publisher", "title", "url"], "properties": {
                "id": {"type": "string", "description": "s1, s2, ..."},
                "publisher": {"type": "string"}, "title": {"type": "string"},
                "url": {"type": "string", "description": "Exact URL of a page returned by web_search in this session"},
                "published": {"type": "string", "description": "YYYY-MM-DD if known"},
                "kind": {"type": "string", "enum": ["press", "company", "database"]}}}},
            "account": {"type": "object", "required": ["name", "description", "segments"], "properties": {
                "name": {"type": "string"}, "description": {"type": "string", "description": "One line: what the company does"},
                "website": {"type": "string"}, "billing_city": {"type": "string"}, "billing_country": {"type": "string"},
                "founded_year": {"type": "integer"}, "number_of_employees": {"type": "integer"},
                "company_stage": {"type": "string", "description": "Latest round, e.g. Series A"},
                "sub_segment": {"type": "string", "description": "Short category, e.g. Parts & Service Orchestration"},
                "segments": {"type": "array", "items": {"type": "object", "required": ["segment_id", "is_primary"], "properties": {
                    "segment_id": {"type": "string"}, "is_primary": {"type": "boolean"}}}}}},
            "contacts": {"type": "array", "items": {"type": "object", "required": ["name", "title", "source"], "properties": {
                "name": {"type": "string"}, "title": {"type": "string"},
                "domain_evidence": {"type": "string", "description": "Professional background only, as stated by the source"},
                "evidence_status": {"type": "string", "enum": ["third", "company"]}, "source": {"type": "string"}}}},
            "funding_rounds": {"type": "array", "items": {"type": "object", "required": ["id", "stage", "quarter", "source"], "properties": {
                "id": {"type": "string", "description": "<slug>-<stage>, e.g. clearops-series-a"},
                "stage": {"type": "string"}, "quarter": {"type": "string", "description": "e.g. 2026 Q2"},
                "amount_local": {"type": "string", "description": "As announced, e.g. €8.6M; \"Undisclosed\" if the amount is not public"},
                "amount_usd_m": {"type": ["number", "null"], "description": "USD millions; null if undisclosed. Convert only if not stated and say so in a claim note"},
                "investors": {"type": "array", "items": {"type": "object", "required": ["name", "role"], "properties": {
                    "name": {"type": "string"}, "role": {"type": "string", "enum": ["lead", "participant"]}}}},
                "source": {"type": "string"}}}},
            "claims": {"type": "array", "items": {"type": "object", "required": ["id", "name", "status"], "properties": {
                "id": {"type": "string"}, "name": {"type": "string"},
                "value": {"type": ["string", "null"], "description": "null when status is missing"},
                "status": {"type": "string", "enum": sorted(STATUSES)},
                "critical": {"type": "boolean"}, "source": {"type": "string"},
                "note": {"type": "string", "description": "Why this status; for missing, what to request from the company"}}}},
        },
    },
}


def system_prompt(segments: List[dict], today: str) -> str:
    seg_lines = "\n".join(f"- {s['id']}: {s['name']}" for s in segments)
    crit = "\n".join(f"- id '<prefix>-{k}': {n}" for k, n in CRITICAL)
    return f"""You are the research analyst inside Conviction AI, an investment-intelligence tool for venture and private equity investors.
Today is {today}. Research one private company from public web sources and submit a company pack with submit_pack.

How to research
- Start with the company's latest funding announcement, then its website, then news and startup databases.
- Use web_search; you have up to {MAX_SEARCHES} searches. Prefer primary sources (the company, the lead investor) and reputable press.
- If the name is ambiguous, pick the company that best matches the user's hint and say which one in the account description.

Rules (a validator enforces the first four; violations are sent back to you)
1. Every claim that is not `missing` or `assumption` has a `source` id, and every source URL is a page returned by web_search in this session. Never cite a URL you did not get from a search.
2. A `missing` claim has value null.
3. Statuses: `third` = reported by press or a database; `company` = the company says so (its site, its press release, its claimed results); `inferred` = your reasoning from sourced facts, phrased as something to verify; `disputed` = sources disagree (add one claim per value, each with its own source, both `disputed`, and a note naming the conflict); `missing` = needed but not public. Never use `verified` or `calculated`: you cannot verify, and you never compute metrics.
4. If the company clearly belongs to one of these tracked segments, account.segments has exactly one is_primary entry from this list. If it fits none, leave account.segments empty ([]) and describe its market in sub_segment. Never force a fit:
{seg_lines}
5. Include these ten claims, all with critical: true. <prefix> is the company name in lowercase with only letters and digits ("Acme Robotics" → "acmerobotics"). Private financials are almost never public: mark them `missing` with a note saying what to request in the data room. Never estimate or invent a number.
{crit}
6. Company-reported results (e.g. "up to 40% faster") stay `company`.
7. People: professional facts only, as stated by the source. No personal details.
8. Add other useful sourced facts as non-critical claims: founded, headquarters, employees, lead investor, prior funding, competitors, notable partnerships, recent news.
9. An honest pack with gaps beats a complete-looking one.

When done, call submit_pack once. Do not write a long answer in text."""


def _blocks(resp) -> List[dict]:
    """Response content as plain dicts (works for SDK objects and test fakes)."""
    out = []
    for b in resp.content:
        out.append(b if isinstance(b, dict) else b.model_dump(exclude_none=True))
    return out


def _norm(url: str) -> str:
    return url.strip().rstrip("/").split("#")[0].lower().replace("http://", "https://").replace("://www.", "://")


def build_pack(raw: dict, company: str, model: str, today: str, segment_ids) -> dict:
    """Fill the fields the agent doesn't need to think about, so the result is a complete pack."""
    raw = json.loads(json.dumps(raw))  # deep copy
    a = raw.get("account") or {}
    a.setdefault("name", company)
    a["slug"] = slugify(a.get("slug") or a["name"])
    a["record_type"] = "Startup"
    for s in raw.get("sources", []):
        s.setdefault("retrieved", today)
    for r in raw.get("funding_rounds", []):
        r.setdefault("segment_id", next((s["segment_id"] for s in a.get("segments", []) if s.get("is_primary")), None))
        if r.get("segment_id") not in segment_ids:
            r.pop("segment_id", None)
    for c in raw.get("claims", []):
        if c.get("status") == "missing":
            c["value"] = None
    return {
        "pack_version": "1.0", "generated_at": today, "generated_by": f"Conviction AI research agent ({model}) · not yet reviewed",
        "is_synthetic": False, "sources": raw.get("sources", []), "account": a, "contacts": raw.get("contacts", []),
        "funding_rounds": raw.get("funding_rounds", []), "claims": raw.get("claims", []), "customer_arr": [],
        "opportunity": {"id": a["slug"], "fund_id": "f2", "stage_name": "Identified", "round_label": "Researched · track",
                        "owner_name": "Research agent", "flag": "Researched live · financials not public"},
    }


def check(pack: dict, seen_urls: set, segment_ids) -> List[str]:
    problems = validate(pack, segment_ids)
    for s in pack.get("sources", []):
        if s.get("url") and _norm(s["url"]) not in seen_urls:
            problems.append(f"Source {s.get('id')} ({s['url']}) was not returned by any web_search in this session. "
                            "Cite only pages you found; remove it or replace it.")
    if pack["opportunity"]["stage_name"] not in STAGES:  # defensive; fixed above
        problems.append("opportunity.stage_name invalid")
    slug = pack["account"]["slug"]
    have = {c.get("id") for c in pack.get("claims", [])}
    for k, n in CRITICAL:
        if f"{slug}-{k}" not in have:
            problems.append(f"Missing critical claim '{slug}-{k}' ({n}). Add it; use status missing if not public.")
    if not pack.get("sources"):
        problems.append("No sources. Search first, then cite what you found.")
    return problems


def run_research(company: str, client, segments: List[dict], on_event: Callable[[str], None] = lambda m: None,
                 hint: str = "", model: Optional[str] = None, today: Optional[str] = None) -> dict:
    """Runs the agent until it submits a valid pack. Raises RuntimeError if it can't."""
    model = model or os.environ.get("RESEARCH_MODEL", DEFAULT_MODEL)
    today = today or dt.date.today().isoformat()
    segment_ids = {s["id"] for s in segments}
    tools = [{"type": "web_search_20250305", "name": "web_search", "max_uses": MAX_SEARCHES}, SUBMIT_TOOL]
    ask = f"Research this company: {company}" + (f"\nHint from the investor: {hint}" if hint else "")
    messages: List[Dict] = [{"role": "user", "content": ask}]
    seen: set = set()
    fixes = 0
    on_event(f"Researching {company} with {model}")

    for _ in range(MAX_TURNS):
        resp = client.messages.create(model=model, max_tokens=16000, system=system_prompt(segments, today),
                                      tools=tools, messages=messages)
        blocks = _blocks(resp)
        messages.append({"role": "assistant", "content": blocks})
        submit = None
        for b in blocks:
            t = b.get("type")
            if t == "server_tool_use" and b.get("name") == "web_search":
                on_event(f"Searching: {b.get('input', {}).get('query', '')}")
            elif t == "web_search_tool_result":
                content = b.get("content")
                if isinstance(content, list):
                    for item in content:
                        if item.get("url"):
                            seen.add(_norm(item["url"]))
                    on_event(f"Read {len(content)} results")
                else:
                    on_event(f"Search error: {(content or {}).get('error_code', 'unknown')}")
            elif t == "tool_use" and b.get("name") == "submit_pack":
                submit = b

        if resp.stop_reason == "pause_turn":
            continue  # long search turn: send the assistant message back unchanged
        if submit is None:
            messages.append({"role": "user", "content": "Finish now: call submit_pack with the pack."})
            continue

        pack = build_pack(submit.get("input") or {}, company, model, today, segment_ids)
        problems = check(pack, seen, segment_ids)
        if not problems:
            n = pack["claims"]
            on_event(f"Pack ready: {len(n)} claims from {len(pack['sources'])} sources, "
                     f"{sum(c['status'] == 'missing' for c in n)} missing, {sum(c['status'] == 'disputed' for c in n)} disputed")
            return pack
        fixes += 1
        on_event(f"Validator found {len(problems)} problem(s); asking the agent to fix them")
        if fixes > MAX_FIX_ROUNDS:
            raise RuntimeError("The research agent could not produce a valid pack:\n- " + "\n- ".join(problems))
        messages.append({"role": "user", "content": [{"type": "tool_result", "tool_use_id": submit["id"], "is_error": True,
                                                      "content": "Fix these problems and call submit_pack again:\n- " + "\n- ".join(problems)}]})
    raise RuntimeError("The research agent ran out of turns before submitting a valid pack.")
