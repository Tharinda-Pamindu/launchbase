from datetime import timedelta

import pytest

from app.models import PlanStatus
from app.services.plans import current_monday
from tests.factories import add_plan, auth

GOOD_TASKS = [
    {
        "kind": "main",
        "title": "Invoices export to CSV, confirmed with a real customer file",
        "why": "Finance teams churn without exports",
        "estimate_hours": 12,
    },
    {"kind": "sub_goal", "title": "Export handles 10k rows in under 5s, measured"},
    {"kind": "gtm", "title": "Changelog entry for CSV export published"},
]


def plans_url(org_world, suffix: str = "") -> str:
    return f"/app/organizations/{org_world.org.id}/plans{suffix}"


async def create_plan(async_client, org_world, user, tasks=None, week=None):
    response = await async_client.post(
        plans_url(org_world),
        json={
            "week_start": str(week or current_monday()),
            "tasks": GOOD_TASKS if tasks is None else tasks,
        },
        headers=auth(user),
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.asyncio
async def test_create_plan_week_rules(async_client, world):
    a = world.a
    monday = current_monday()
    cases = [
        (monday + timedelta(days=2), 400),  # not a Monday
        (monday - timedelta(days=14), 400),  # too far back
        (monday + timedelta(days=14), 400),  # too far ahead
    ]
    for week, expected in cases:
        response = await async_client.post(
            plans_url(a), json={"week_start": str(week)}, headers=auth(a.member)
        )
        assert response.status_code == expected, week

    plan = await create_plan(async_client, a, a.member)
    assert plan["status"] == "draft"
    assert [t["kind"] for t in plan["tasks"]] == ["main", "sub_goal", "gtm"]
    assert plan["total_estimate_hours"] == 12
    assert plan["permissions"]["edit"] and plan["permissions"]["submit"]
    # No key in tests, so the AI button isn't offered.
    assert plan["permissions"]["ai_review"] is False

    response = await async_client.post(
        plans_url(a), json={"week_start": str(monday)}, headers=auth(a.member)
    )
    assert response.status_code == 409

    # Next week's plan is a separate plan.
    await create_plan(async_client, a, a.member, week=monday + timedelta(days=7))


@pytest.mark.asyncio
async def test_replace_tasks_keeps_ids_and_one_main(async_client, world):
    a = world.a
    plan = await create_plan(async_client, a, a.member)
    main, sub, gtm = plan["tasks"]

    # Reorder, edit the sub-goal, drop the GTM task and add a new one.
    response = await async_client.put(
        plans_url(a, f"/{plan['id']}"),
        json={
            "tasks": [
                {
                    "id": main["id"],
                    "kind": "main",
                    "title": main["title"],
                    "why": "Churn",
                },
                {"kind": "gtm", "title": "Onboarding tooltip for export, live"},
                {"id": sub["id"], "kind": "sub_goal", "title": "Export streams rows"},
            ]
        },
        headers=auth(a.member),
    )
    assert response.status_code == 200, response.text
    tasks = response.json()["tasks"]
    assert [t["id"] for t in tasks][0::2] == [main["id"], sub["id"]]
    assert gtm["id"] not in [t["id"] for t in tasks]
    assert tasks[2]["title"] == "Export streams rows"

    # Swapping which task is main works in one request.
    response = await async_client.put(
        plans_url(a, f"/{plan['id']}"),
        json={
            "tasks": [
                {"id": main["id"], "kind": "sub_goal", "title": main["title"]},
                {
                    "id": sub["id"],
                    "kind": "main",
                    "title": "Export streams",
                    "why": "x",
                },
            ]
        },
        headers=auth(a.member),
    )
    assert response.status_code == 200, response.text

    for bad in (
        [{"kind": "main", "title": "a"}, {"kind": "main", "title": "b"}],
        [{"kind": "gtm", "title": "a", "why": "only main has a why"}],
        [{"id": str(world.a.org.id), "kind": "gtm", "title": "unknown id"}],
    ):
        response = await async_client.put(
            plans_url(a, f"/{plan['id']}"), json={"tasks": bad}, headers=auth(a.member)
        )
        assert response.status_code == 400, bad


@pytest.mark.asyncio
async def test_full_week_workflow(async_client, world):
    a = world.a
    plan = await create_plan(async_client, a, a.member)
    url = plans_url(a, f"/{plan['id']}")

    # The lead can't see a draft at all.
    assert (await async_client.get(url, headers=auth(a.lead))).status_code == 404

    submitted = await async_client.post(f"{url}/submit", headers=auth(a.member))
    assert submitted.status_code == 200
    assert submitted.json()["status"] == "submitted"
    assert submitted.json()["permissions"]["edit"] is False

    # Now the lead sees it and may review it; in their queue too.
    seen = await async_client.get(url, headers=auth(a.lead))
    assert seen.status_code == 200
    assert seen.json()["permissions"]["review"] is True
    queue = await async_client.get(
        f"/app/organizations/{a.org.id}/approvals", headers=auth(a.lead)
    )
    assert [p["id"] for p in queue.json()] == [plan["id"]]

    # Sent back with a comment: back to draft, comment kept.
    no_comment = await async_client.post(
        f"{url}/request-changes", json={"comment": ""}, headers=auth(a.lead)
    )
    assert no_comment.status_code == 422
    sent_back = await async_client.post(
        f"{url}/request-changes",
        json={"comment": "Cut the perf goal, it won't fit"},
        headers=auth(a.lead),
    )
    assert sent_back.status_code == 200
    assert sent_back.json()["status"] == "draft"

    mine = await async_client.get(url, headers=auth(a.member))
    assert mine.json()["reviews"][0]["action"] == "changes_requested"
    assert mine.json()["reviews"][0]["comment"] == "Cut the perf goal, it won't fit"

    # Resubmit and approve.
    await async_client.post(f"{url}/submit", headers=auth(a.member))
    approved = await async_client.post(f"{url}/approve", json={}, headers=auth(a.lead))
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"

    # Tick tasks during the week.
    task_id = mine.json()["tasks"][1]["id"]
    ticked = await async_client.patch(
        f"{url}/tasks/{task_id}", json={"is_done": True}, headers=auth(a.member)
    )
    assert ticked.status_code == 200 and ticked.json()["is_done"] is True
    # Only the author ticks.
    response = await async_client.patch(
        f"{url}/tasks/{task_id}", json={"is_done": False}, headers=auth(a.lead)
    )
    assert response.status_code == 403

    # Close the week: shipped or not is required.
    response = await async_client.post(
        f"{url}/complete", json={}, headers=auth(a.member)
    )
    assert response.status_code == 422
    done = await async_client.post(
        f"{url}/complete",
        json={"main_goal_shipped": True, "outcome_note": "Live for all accounts"},
        headers=auth(a.member),
    )
    assert done.status_code == 200
    assert done.json()["status"] == "done"
    assert done.json()["main_goal_shipped"] is True

    # Done is final.
    response = await async_client.patch(
        f"{url}/tasks/{task_id}", json={"is_done": False}, headers=auth(a.member)
    )
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_submit_requires_main_task_with_why(async_client, world):
    a = world.a
    plan = await create_plan(
        async_client, a, a.member, tasks=[{"kind": "sub_goal", "title": "Something"}]
    )
    response = await async_client.post(
        plans_url(a, f"/{plan['id']}/submit"), headers=auth(a.member)
    )
    assert response.status_code == 400

    await async_client.put(
        plans_url(a, f"/{plan['id']}"),
        json={"tasks": [{"kind": "main", "title": "Ship export"}]},
        headers=auth(a.member),
    )
    response = await async_client.post(
        plans_url(a, f"/{plan['id']}/submit"), headers=auth(a.member)
    )
    assert response.status_code == 400
    assert "why" in response.json()["detail"][0]["msg"]


@pytest.mark.asyncio
async def test_plan_without_any_approver_cannot_be_submitted(async_client, world):
    a = world.a
    plan = await create_plan(async_client, a, a.loner)
    response = await async_client.post(
        plans_url(a, f"/{plan['id']}/submit"), headers=auth(a.loner)
    )
    assert response.status_code == 409
    assert response.json()["detail"][0]["type"] == "no_approver"


@pytest.mark.asyncio
async def test_who_may_approve(async_client, world, session_factory):
    """D3: the author's team lead; never the author; a lead's own plan by an
    org owner or admin; nobody else, and an org admin can't approve a plain
    member's plan over the lead's head."""
    a = world.a
    member_plan = await add_plan(
        session_factory, org=a.org, user=a.member, status=PlanStatus.SUBMITTED
    )
    lead_plan = await add_plan(
        session_factory, org=a.org, user=a.lead, status=PlanStatus.SUBMITTED
    )

    # A teammate (non-lead) can't read or approve.
    response = await async_client.post(
        plans_url(a, f"/{member_plan.id}/approve"), json={}, headers=auth(a.teammate)
    )
    assert response.status_code == 404
    # The org admin isn't the member's approver either.
    response = await async_client.post(
        plans_url(a, f"/{member_plan.id}/approve"), json={}, headers=auth(a.admin)
    )
    assert response.status_code == 404
    # The lead can't approve their own plan.
    response = await async_client.post(
        plans_url(a, f"/{lead_plan.id}/approve"), json={}, headers=auth(a.lead)
    )
    assert response.status_code == 403
    assert response.json()["detail"][0]["type"] == "self_approval"
    # The org admin can approve the lead's plan.
    response = await async_client.post(
        plans_url(a, f"/{lead_plan.id}/approve"), json={}, headers=auth(a.admin)
    )
    assert response.status_code == 200
    # And the lead approves the member's.
    response = await async_client.post(
        plans_url(a, f"/{member_plan.id}/approve"), json={}, headers=auth(a.lead)
    )
    assert response.status_code == 200
    assert response.json()["reviews"][0]["reviewer_name"].startswith("AcmeLead")


@pytest.mark.asyncio
async def test_only_author_edits_and_wrong_states_conflict(
    async_client, world, session_factory
):
    a = world.a
    approved = await add_plan(
        session_factory, org=a.org, user=a.member, status=PlanStatus.APPROVED
    )
    url = plans_url(a, f"/{approved.id}")

    # The lead can read it, but not edit or close it.
    response = await async_client.put(url, json={"tasks": []}, headers=auth(a.lead))
    assert response.status_code == 403
    response = await async_client.post(
        f"{url}/complete", json={"main_goal_shipped": True}, headers=auth(a.lead)
    )
    assert response.status_code == 403

    # The author can't edit an approved plan or submit it again.
    response = await async_client.put(url, json={"tasks": []}, headers=auth(a.member))
    assert response.status_code == 409
    response = await async_client.post(f"{url}/submit", headers=auth(a.member))
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_withdraw(async_client, world):
    a = world.a
    plan = await create_plan(async_client, a, a.member)
    url = plans_url(a, f"/{plan['id']}")
    await async_client.post(f"{url}/submit", headers=auth(a.member))
    response = await async_client.post(f"{url}/withdraw", headers=auth(a.member))
    assert response.status_code == 200
    assert response.json()["status"] == "draft"
    assert (await async_client.get(url, headers=auth(a.lead))).status_code == 404


@pytest.mark.asyncio
async def test_list_my_plans(async_client, world, session_factory):
    a = world.a
    await add_plan(
        session_factory,
        org=a.org,
        user=a.member,
        week_start=current_monday() - timedelta(days=7),
        status=PlanStatus.DONE,
    )
    await add_plan(session_factory, org=a.org, user=a.member)
    await add_plan(session_factory, org=a.org, user=a.teammate)

    response = await async_client.get(plans_url(a), headers=auth(a.member))
    body = response.json()
    assert body["total"] == 2
    assert [p["week_start"] for p in body["items"]] == sorted(
        [p["week_start"] for p in body["items"]], reverse=True
    )

    this_week = await async_client.get(
        plans_url(a),
        params={"week_start": str(current_monday())},
        headers=auth(a.member),
    )
    assert this_week.json()["total"] == 1
