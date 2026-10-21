"""CrewAI reference implementation for the synthetic account-prep workflow.

This module demonstrates orchestration only. It does not connect to Salesforce,
Snowflake, Gong, Slack, contact vendors, or email. Supply a synthetic account
context and an AE acceptance event from a trusted integration in a real system.
"""
from __future__ import annotations

import os
from typing import Any

from crewai import Agent, Crew, LLM, Process, Task
from crewai.flow.flow import Flow, listen, start
from dotenv import load_dotenv
from pydantic import BaseModel, Field


load_dotenv()


class AccountPrepState(BaseModel):
    account_id: str = ""
    ae_accepted: bool = False
    account_context: dict[str, Any] = Field(default_factory=dict)
    review_package: str = ""
    status: str = "initialized"


def _llm() -> LLM:
    """Resolve the model from environment; credentials stay outside source."""
    return LLM(model=os.getenv("MODEL", "openai/gpt-4o-mini"), temperature=0.1)


def build_account_prep_crew() -> Crew:
    """Create four constrained agents with sequential, explicit handoffs."""
    llm = _llm()
    identifier = Agent(
        role="Account Identifier",
        goal="Select a relevant outreach sequence and identify candidate contacts only from supplied, permitted records.",
        backstory="You are a careful GTM operations specialist. Never invent contact details. Mark gaps and confidence clearly.",
        llm=llm,
        allow_delegation=False,
        verbose=False,
    )
    researcher = Agent(
        role="Account Researcher",
        goal="Summarize the supplied account context and attach evidence references to every factual statement.",
        backstory="You preserve source provenance and freshness. Unknown values remain unknown; you never turn absence into a negative claim.",
        llm=llm,
        allow_delegation=False,
        verbose=False,
    )
    composer = Agent(
        role="Outreach Composer",
        goal="Draft concise, personalized outreach using only facts supported by the supplied evidence.",
        backstory="You write useful first drafts. You do not send messages or make commitments on behalf of the seller.",
        llm=llm,
        allow_delegation=False,
        verbose=False,
    )
    validator = Agent(
        role="Evidence and Policy Validator",
        goal="Review the proposed contacts and message for unsupported claims, missing evidence, and policy gaps.",
        backstory="You fail closed. Return specific findings and require a human AE decision for any external action.",
        llm=llm,
        allow_delegation=False,
        verbose=False,
    )

    identify_task = Task(
        description=(
            "For this synthetic account context, identify a suitable sequence from the supplied catalog and list only "
            "the supplied contact candidates. Mark missing fields and role confidence. Do not invent people or data.\n"
            "Account context: {account_context}"
        ),
        expected_output="A structured candidate summary with sequence, contacts, source, role confidence, and gaps.",
        agent=identifier,
    )
    research_task = Task(
        description=(
            "Create a compact account brief from the supplied account context and identifier results. Every claim must "
            "point to a supplied evidence key. Label uncertainty and stale/unknown values.\nAccount context: {account_context}"
        ),
        expected_output="An evidence-linked account brief with claims, source keys, freshness, and unknowns.",
        agent=researcher,
        context=[identify_task],
    )
    compose_task = Task(
        description=(
            "Draft one short email using only the account brief and supplied contact. Add a subject and body. "
            "Do not claim a customer fact without evidence. This is a draft only; do not send."
        ),
        expected_output="A subject and email body with evidence references for factual claims.",
        agent=composer,
        context=[research_task],
    )
    validate_task = Task(
        description=(
            "Check the contact and draft for unsupported claims, absent evidence references, missing fields, or policy concerns. "
            "Return PASS or NEEDS_REVIEW, findings, and the draft unchanged. Never send or approve on behalf of an AE."
        ),
        expected_output="Validation status, concise findings, evidence coverage, and the unchanged draft.",
        agent=validator,
        context=[identify_task, research_task, compose_task],
    )
    return Crew(
        agents=[identifier, researcher, composer, validator],
        tasks=[identify_task, research_task, compose_task, validate_task],
        process=Process.sequential,
        verbose=False,
    )


class AccountPreparationFlow(Flow[AccountPrepState]):
    """Flow controls acceptance and state; the Crew performs bounded reasoning."""

    @start()
    def require_ae_acceptance(self) -> dict[str, Any]:
        if not self.state.ae_accepted:
            raise ValueError("An explicit AE acceptance event is required to start agent work.")
        if not self.state.account_id:
            raise ValueError("account_id is required.")
        self.state.status = "accepted"
        return self.state.account_context

    @listen(require_ae_acceptance)
    def prepare_review_package(self, account_context: dict[str, Any]) -> str:
        self.state.status = "preparing"
        result = build_account_prep_crew().kickoff(
            inputs={"account_context": account_context}
        )
        self.state.review_package = result.raw
        self.state.status = "awaiting_ae_review"
        return self.state.review_package


def run_account_preparation(
    *, account_id: str, account_context: dict[str, Any], ae_accepted: bool
) -> tuple[AccountPreparationFlow, str]:
    """Run the sample flow and return the Flow object plus review-package text."""
    flow = AccountPreparationFlow()
    output = flow.kickoff(
        inputs={
            "account_id": account_id,
            "account_context": account_context,
            "ae_accepted": ae_accepted,
        }
    )
    return flow, str(output)
