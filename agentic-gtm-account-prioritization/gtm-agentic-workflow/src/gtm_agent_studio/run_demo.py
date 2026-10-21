"""Run the CrewAI flow using a fictional account record."""
from __future__ import annotations

import json
from pathlib import Path

from gtm_agent_studio.flow import run_account_preparation


def main() -> None:
    sample = Path(__file__).resolve().parents[2] / "sample-data" / "sample-account.json"
    payload = json.loads(sample.read_text())
    flow, result = run_account_preparation(
        account_id=payload["account_id"],
        account_context=payload["account_context"],
        ae_accepted=True,
    )
    print(json.dumps({"flow_id": flow.state.id, "status": flow.state.status, "review_package": result}, indent=2))


if __name__ == "__main__":
    main()
