"""The AI features, with Pydantic AI's TestModel / FunctionModel standing in
for Gemini. Nothing here needs a key or network access."""

import asyncio
from typing import Any

import pytest
from pydantic_ai.exceptions import ModelHTTPError
from pydantic_ai.messages import (
    ModelRequest,
    ModelResponse,
    ToolCallPart,
    UserPromptPart,
)
from pydantic_ai.models.function import AgentInfo, FunctionModel
from pydantic_ai.models.test import TestModel
from sqlalchemy import func, select

from app.ai.agents import drafter, reviewer
from app.config import settings
from app.models import AiUsageEvent, WeeklyPlan
from app.services.plans import current_monday
from tests.factories import auth

VAGUE_TASKS = [
    {"kind": "main", "title": "Implement checkout", "estimate_hours": 20},
    {"kind": "sub_goal", "title": "Work on webhook bug"},
]


@pytest.fixture
def ai_key(monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_API_KEY", "test-key-not-real")


def replying(output: dict[str, Any], seen: dict | None = None) -> FunctionModel:
    """A model that returns `output` as the agent's structured result, and
    records the prompt it was given."""

    def respond(messages, info: AgentInfo) -> ModelResponse:
        if seen is not None:
            seen["prompt"] = "\n".join(
                str(part.content)
                for message in messages
                if isinstance(message, ModelRequest)
                for part in message.parts
                if isinstance(part, UserPromptPart)
            )
        return ModelResponse(parts=[ToolCallPart(info.output_tools[0].name, output)])

    return FunctionModel(respond)


def failing(exc: Exception) -> FunctionModel:
    def respond(messages, info: AgentInfo) -> ModelResponse:
        raise exc

    return FunctionModel(respond)


async def draft_plan(async_client, org_world, user, tasks=VAGUE_TASKS) -> dict:
    response = await async_client.post(
        f"/app/organizations/{org_world.org.id}/plans",
        json={"week_start": str(current_monday()), "tasks": tasks},
        headers=auth(user),
    )
    assert response.status_code == 201, response.text
    return response.json()


async def usage_events(session_factory, org_world) -> list[AiUsageEvent]:
    async with session_factory() as db:
        result = await db.scalars(
            select(AiUsageEvent)
            .where(AiUsageEvent.organization_id == org_world.org.id)
            .order_by(AiUsageEvent.created_at)
        )
        return list(result.all())


def review_url(org_world, plan) -> str:
    return f"/app/organizations/{org_world.org.id}/plans/{plan['id']}/ai-review"


REVIEW = {
    "verdict": "approve",  # contradicted by a must_fix finding below
    "summary": "Two tasks are work, not results, and nothing reaches users.",
    "findings": [
        {
            "task_ref": "MAIN",
            "issue": "not_checkable",
            "severity": "must_fix",
            "problem": "'Implement checkout' is work, not a result you can check.",
            "field": "title",
            "suggested_rewrite": "Checkout takes card payments end to end, "
            "confirmed on staging",
        },
        {
            "task_ref": "MAIN",
            "issue": "missing_why",
            "severity": "must_fix",
            "problem": "No reason given.",
            "field": "why",
            "suggested_rewrite": "Customers can't pay us without it",
        },
        {
            "task_ref": "SG1",
            "issue": "not_checkable",
            "severity": "must_fix",
            "problem": "Which bug, fixed how?",
            # The model asks to rewrite a sub-goal's "why": mapped to title.
            "field": "why",
            "suggested_rewrite": "Webhook retries no longer double-charge, "
            "confirmed on staging",
        },
        {
            "task_ref": "NEW",
            "issue": "missing_gtm",
            "severity": "must_fix",
            "problem": "Nothing puts checkout in front of users.",
            "field": "title",
            "suggested_rewrite": "Changelog entry for the new checkout published",
        },
        {
            "task_ref": "SG7",  # no such task: dropped
            "issue": "unclear",
            "severity": "consider",
            "problem": "Hallucinated.",
            "field": "title",
            "suggested_rewrite": "Nothing",
        },
    ],
}


@pytest.mark.asyncio
async def test_plan_review_maps_findings_to_tasks(
    async_client, world, session_factory, ai_key
):
    a = world.a
    plan = await draft_plan(async_client, a, a.member)
    main, sub = plan["tasks"]
    seen: dict = {}

    with reviewer.override(model=replying(REVIEW, seen)):
        response = await async_client.post(review_url(a, plan), headers=auth(a.member))

    assert response.status_code == 200, response.text
    review = response.json()["ai_review"]
    assert review["verdict"] == "adjust"  # must_fix findings overrule "approve"
    assert review["is_stale"] is False
    findings = review["findings"]
    assert [(f["task_id"], f["field"]) for f in findings] == [
        (main["id"], "title"),
        (main["id"], "why"),
        (sub["id"], "title"),
        (None, "title"),
    ]
    assert findings[3]["task_kind"] == "gtm"

    # The model saw task content and refs, not people or ids.
    prompt = seen["prompt"]
    assert "MAIN: Implement checkout [20h]" in prompt
    assert "why: (not given)" in prompt
    assert "SG1: Work on webhook bug" in prompt
    assert "(no go-to-market tasks)" in prompt
    assert a.member.email not in prompt and a.member.first_name not in prompt
    assert main["id"] not in prompt

    # One successful call recorded against the organization.
    [event] = await usage_events(session_factory, a)
    assert (event.operation, event.outcome) == ("plan_review", "succeeded")
    assert event.user_id == a.member.id
    assert event.input_tokens and event.output_tokens


@pytest.mark.asyncio
async def test_applying_a_rewrite_marks_the_review_stale(async_client, world, ai_key):
    a = world.a
    plan = await draft_plan(async_client, a, a.member)
    with reviewer.override(model=replying(REVIEW)):
        reviewed = await async_client.post(review_url(a, plan), headers=auth(a.member))
    finding = reviewed.json()["ai_review"]["findings"][0]

    # "Apply" = the form writes the suggestion into that task and saves.
    tasks = [
        {
            "id": t["id"],
            "kind": t["kind"],
            "title": finding["suggested_rewrite"]
            if t["id"] == finding["task_id"]
            else t["title"],
        }
        for t in reviewed.json()["tasks"]
    ]
    saved = await async_client.put(
        f"/app/organizations/{a.org.id}/plans/{plan['id']}",
        json={"tasks": tasks},
        headers=auth(a.member),
    )
    assert saved.status_code == 200
    assert saved.json()["tasks"][0]["title"].startswith("Checkout takes card payments")
    assert saved.json()["ai_review"]["is_stale"] is True


@pytest.mark.asyncio
async def test_review_is_private_to_the_author(async_client, world, ai_key):
    a = world.a
    plan = await draft_plan(
        async_client,
        a,
        a.member,
        tasks=[{"kind": "main", "title": "Export works", "why": "Customers ask"}],
    )
    with reviewer.override(model=TestModel()):
        await async_client.post(review_url(a, plan), headers=auth(a.member))
    await async_client.post(
        f"/app/organizations/{a.org.id}/plans/{plan['id']}/submit",
        headers=auth(a.member),
    )

    as_lead = await async_client.get(
        f"/app/organizations/{a.org.id}/plans/{plan['id']}", headers=auth(a.lead)
    )
    assert as_lead.status_code == 200
    assert as_lead.json()["ai_review"] is None

    # Only drafts get reviewed, and only by their author.
    response = await async_client.post(review_url(a, plan), headers=auth(a.member))
    assert response.status_code == 409
    response = await async_client.post(review_url(a, plan), headers=auth(a.lead))
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_no_key_fails_plainly_and_planning_still_works(
    async_client, world, session_factory
):
    a = world.a
    plan = await draft_plan(async_client, a, a.member)

    response = await async_client.post(review_url(a, plan), headers=auth(a.member))
    assert response.status_code == 503
    assert "still write and submit" in response.json()["detail"][0]["msg"]

    status = await async_client.get("/app/ai/status", headers=auth(a.member))
    assert status.json() == {"available": False}

    [event] = await usage_events(session_factory, a)
    assert (event.outcome, event.error_kind) == ("failed", "not_configured")

    # The plan is untouched and can be submitted without the AI.
    submitted = await async_client.put(
        f"/app/organizations/{a.org.id}/plans/{plan['id']}",
        json={"tasks": [{"kind": "main", "title": "Checkout live", "why": "Revenue"}]},
        headers=auth(a.member),
    )
    assert submitted.status_code == 200
    response = await async_client.post(
        f"/app/organizations/{a.org.id}/plans/{plan['id']}/submit",
        headers=auth(a.member),
    )
    assert response.status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("model", "status", "code", "outcome", "error_kind"),
    [
        (
            failing(ModelHTTPError(429, "gemini-3.5-flash-lite")),
            429,
            "ai_rate_limited",
            "rate_limited",
            "provider_rate_limit",
        ),
        (
            failing(ModelHTTPError(500, "gemini-3.5-flash-lite")),
            503,
            "ai_unavailable",
            "failed",
            "provider_http_500",
        ),
        (
            # Fails output validation on every retry.
            replying({"verdict": "maybe", "summary": "?", "findings": "none"}),
            502,
            "ai_bad_output",
            "failed",
            "invalid_output",
        ),
    ],
)
async def test_provider_failures_are_mapped_and_recorded(
    async_client,
    world,
    session_factory,
    ai_key,
    model,
    status,
    code,
    outcome,
    error_kind,
):
    a = world.a
    plan = await draft_plan(async_client, a, a.member)

    with reviewer.override(model=model):
        response = await async_client.post(review_url(a, plan), headers=auth(a.member))

    assert response.status_code == status
    assert response.json()["detail"][0]["type"] == code
    [event] = await usage_events(session_factory, a)
    assert (event.outcome, event.error_kind) == (outcome, error_kind)

    async with session_factory() as db:
        stored = await db.get(WeeklyPlan, plan["id"])
        assert stored is not None and stored.ai_review is None


@pytest.mark.asyncio
async def test_slow_model_times_out(
    async_client, world, session_factory, ai_key, monkeypatch
):
    a = world.a
    plan = await draft_plan(async_client, a, a.member)
    monkeypatch.setattr(settings, "AI_TIMEOUT_SECONDS", 0.05)

    async def slow(messages, info: AgentInfo) -> ModelResponse:
        await asyncio.sleep(1)
        raise AssertionError("should have timed out")

    with reviewer.override(model=FunctionModel(slow)):
        response = await async_client.post(review_url(a, plan), headers=auth(a.member))

    assert response.status_code == 504
    [event] = await usage_events(session_factory, a)
    assert (event.outcome, event.error_kind) == ("failed", "timeout")


@pytest.mark.asyncio
async def test_local_rate_limit(
    async_client, world, session_factory, ai_key, monkeypatch
):
    a = world.a
    monkeypatch.setattr(settings, "AI_RATE_LIMIT_PER_MINUTE", 2)
    url = f"/app/organizations/{a.org.id}/ai/plan-drafts"
    body = {"notes": "finish the billing page and announce it"}

    with drafter.override(model=TestModel()):
        statuses = [
            (
                await async_client.post(url, json=body, headers=auth(a.member))
            ).status_code
            for _ in range(3)
        ]
        # The limit is per person: a colleague is unaffected.
        other = await async_client.post(url, json=body, headers=auth(a.teammate))

    assert statuses == [200, 200, 429]
    assert other.status_code == 200
    outcomes = [
        (e.outcome, e.error_kind) for e in await usage_events(session_factory, a)
    ]
    assert ("rate_limited", "local_limit") in outcomes


@pytest.mark.asyncio
async def test_brain_dump_returns_a_draft_and_saves_nothing(
    async_client, world, session_factory, ai_key
):
    a = world.a
    notes = (
        "need to finish the billing page, probably also fix that webhook bug, "
        "should announce it in the changelog. also dentist on thursday"
    )
    draft = {
        "main_task": {
            "title": "Billing page lets customers update cards, live in prod",
            "why": "Failed renewals are costing us accounts",
            "estimate_hours": 16,
        },
        "sub_goals": [
            {"title": "Webhook retries no longer double-charge, confirmed on staging"}
        ],
        "gtm_goals": [{"title": "Changelog entry for the billing page published"}],
        "left_out": ["Dentist on Thursday"],
    }
    seen: dict = {}

    with drafter.override(model=replying(draft, seen)):
        response = await async_client.post(
            f"/app/organizations/{a.org.id}/ai/plan-drafts",
            json={"notes": notes},
            headers=auth(a.member),
        )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["main_task"]["why"] == "Failed renewals are costing us accounts"
    assert body["sub_goals"][0]["estimate_hours"] is None
    assert body["left_out"] == ["Dentist on Thursday"]
    assert seen["prompt"] == notes

    async with session_factory() as db:
        plans = await db.scalar(
            select(func.count())
            .select_from(WeeklyPlan)
            .where(WeeklyPlan.organization_id == a.org.id)
        )
    assert plans == 0
    [event] = await usage_events(session_factory, a)
    assert (event.operation, event.outcome) == ("plan_draft", "succeeded")


@pytest.mark.asyncio
async def test_brain_dump_validation(async_client, world, ai_key):
    a = world.a
    url = f"/app/organizations/{a.org.id}/ai/plan-drafts"
    for notes in ("too short", "x" * 4001):
        response = await async_client.post(
            url, json={"notes": notes}, headers=auth(a.member)
        )
        assert response.status_code == 422
    # Outsiders can't spend another org's AI quota.
    response = await async_client.post(
        url, json={"notes": "a perfectly fine brain dump"}, headers=auth(world.b.owner)
    )
    assert response.status_code == 404
