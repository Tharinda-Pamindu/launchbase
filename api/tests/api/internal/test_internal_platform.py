from datetime import UTC, datetime

import pytest

from app.models import AiOutcome, AiUsageEvent, PlanStatus, User
from tests.factories import add_plan, auth, staff_auth


@pytest.mark.asyncio
async def test_customers_never_reach_the_internal_surface(async_client, world):
    """Org owners and org admins are customers, not platform staff."""
    for user in (world.a.owner, world.a.admin):
        # Their app token is the wrong audience...
        response = await async_client.get("/internal/organizations", headers=auth(user))
        assert response.status_code == 401
        # ...and an internal-audience token without is_admin is refused too.
        response = await async_client.get(
            "/internal/organizations", headers=staff_auth(user)
        )
        assert response.status_code == 403


@pytest.mark.asyncio
async def test_organization_list_and_detail(async_client, world, session_factory):
    a = world.a
    await add_plan(
        session_factory, org=a.org, user=a.member, status=PlanStatus.SUBMITTED
    )

    response = await async_client.get(
        "/internal/organizations",
        params={"q": a.org.name},
        headers=staff_auth(world.staff),
    )
    assert response.status_code == 200
    [row] = response.json()["items"]
    assert (row["member_count"], row["team_count"], row["plan_count"]) == (6, 1, 1)
    assert row["last_active_at"] >= row["created_at"]

    detail = await async_client.get(
        f"/internal/organizations/{a.org.id}", headers=staff_auth(world.staff)
    )
    assert detail.status_code == 200
    body = detail.json()
    assert {m["role"] for m in body["members"]} == {"owner", "admin", "member"}
    assert body["teams"][0]["lead_name"].startswith("AcmeLead")
    # Staff see metadata, never the content of plans.
    assert "Checkout handles expired cards" not in detail.text
    assert "top support ticket" not in detail.text


@pytest.mark.asyncio
async def test_suspend_and_reinstate(async_client, world):
    a = world.a
    url = f"/internal/organizations/{a.org.id}"
    headers = staff_auth(world.staff)

    response = await async_client.post(
        f"{url}/suspend", json={"reason": "Chargeback"}, headers=headers
    )
    assert response.status_code == 200
    assert response.json()["suspended_reason"] == "Chargeback"
    again = await async_client.post(
        f"{url}/suspend", json={"reason": "x"}, headers=headers
    )
    assert again.status_code == 409

    locked = await async_client.get(
        f"/app/organizations/{a.org.id}/plans", headers=auth(a.member)
    )
    assert locked.status_code == 403

    suspended = await async_client.get(
        "/internal/organizations",
        params={"status": "suspended", "q": a.org.name},
        headers=headers,
    )
    assert suspended.json()["total"] == 1

    response = await async_client.post(f"{url}/reinstate", headers=headers)
    assert response.status_code == 200
    unlocked = await async_client.get(
        f"/app/organizations/{a.org.id}/plans", headers=auth(a.member)
    )
    assert unlocked.status_code == 200


@pytest.mark.asyncio
async def test_user_search_detail_and_deactivation(
    async_client, world, session_factory
):
    a = world.a
    headers = staff_auth(world.staff)

    found = await async_client.get(
        "/internal/users", params={"q": a.member.email.upper()}, headers=headers
    )
    assert [u["id"] for u in found.json()["items"]] == [str(a.member.id)]
    by_name = await async_client.get(
        "/internal/users", params={"q": "AcmeMember Test"}, headers=headers
    )
    assert str(a.member.id) in [u["id"] for u in by_name.json()["items"]]

    detail = await async_client.get(f"/internal/users/{a.member.id}", headers=headers)
    assert detail.status_code == 200
    [membership] = detail.json()["memberships"]
    assert membership["organization_id"] == str(a.org.id)
    assert membership["role"] == "member"

    deactivated = await async_client.patch(
        f"/internal/users/{a.member.id}", json={"is_active": False}, headers=headers
    )
    assert deactivated.status_code == 200
    # Their existing session stops working at once.
    response = await async_client.get("/app/users/self", headers=auth(a.member))
    assert response.status_code == 401

    # Staff can't lock themselves out, and can't grant staff from the panel.
    response = await async_client.patch(
        f"/internal/users/{world.staff.id}", json={"is_active": False}, headers=headers
    )
    assert response.status_code == 409
    response = await async_client.patch(
        f"/internal/users/{a.owner.id}", json={"is_admin": True}, headers=headers
    )
    assert response.status_code == 200
    async with session_factory() as db:
        owner = await db.get(User, a.owner.id)
        assert owner is not None and owner.is_admin is False

    # Accounts are deactivated, never hard-deleted.
    response = await async_client.delete(
        f"/internal/users/{a.member.id}", headers=headers
    )
    assert response.status_code == 405


@pytest.mark.asyncio
async def test_ai_usage_views(async_client, world, session_factory):
    a, b = world.a, world.b
    async with session_factory() as db:
        for org, outcome, error_kind in (
            (a.org, AiOutcome.SUCCEEDED, None),
            (a.org, AiOutcome.FAILED, "timeout"),
            (a.org, AiOutcome.RATE_LIMITED, "provider_rate_limit"),
            (b.org, AiOutcome.SUCCEEDED, None),
        ):
            db.add(
                AiUsageEvent(
                    organization_id=org.id,
                    user_id=None,
                    operation="plan_review",
                    outcome=outcome,
                    error_kind=error_kind,
                    model="gemini-3.5-flash-lite",
                    latency_ms=900,
                    input_tokens=100 if outcome == AiOutcome.SUCCEEDED else None,
                    output_tokens=50 if outcome == AiOutcome.SUCCEEDED else None,
                    created_at=datetime.now(UTC),
                )
            )
        await db.commit()
    headers = staff_auth(world.staff)

    summary = await async_client.get("/internal/ai-usage/summary", headers=headers)
    assert summary.status_code == 200
    rows = {r["organization_id"]: r for r in summary.json()["organizations"]}
    row = rows[str(a.org.id)]
    assert (row["calls"], row["succeeded"], row["failed"], row["rate_limited"]) == (
        3,
        1,
        1,
        1,
    )
    assert (row["input_tokens"], row["output_tokens"]) == (100, 50)

    events = await async_client.get(
        "/internal/ai-usage/events",
        params={"organization_id": str(a.org.id), "outcome": "failed"},
        headers=headers,
    )
    [event] = events.json()["items"]
    assert event["error_kind"] == "timeout"
    assert event["organization_name"] == a.org.name
