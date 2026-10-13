from datetime import timedelta

import pytest

from app.models import PlanStatus
from app.services.plans import current_monday
from tests.factories import add_plan, auth


def org_url(org_world, suffix: str = "") -> str:
    return f"/app/organizations/{org_world.org.id}{suffix}"


@pytest.mark.asyncio
async def test_managers_create_and_staff_teams(async_client, world):
    a = world.a
    response = await async_client.post(
        org_url(a, "/teams"), json={"name": "Growth"}, headers=auth(a.lead)
    )
    assert response.status_code == 403

    response = await async_client.post(
        org_url(a, "/teams"), json={"name": "Growth"}, headers=auth(a.admin)
    )
    assert response.status_code == 201
    team_id = response.json()["id"]

    duplicate = await async_client.post(
        org_url(a, "/teams"), json={"name": "Growth"}, headers=auth(a.admin)
    )
    assert duplicate.status_code == 409

    # Add a member, then make them lead; then a second lead replaces them.
    url = org_url(a, f"/teams/{team_id}/members")
    response = await async_client.put(
        f"{url}/{a.member.id}", json={}, headers=auth(a.admin)
    )
    assert response.status_code == 200
    response = await async_client.put(
        f"{url}/{a.member.id}", json={"is_lead": True}, headers=auth(a.admin)
    )
    assert [m["is_lead"] for m in response.json()["members"]] == [True]
    response = await async_client.put(
        f"{url}/{a.loner.id}", json={"is_lead": True}, headers=auth(a.admin)
    )
    leads = [m["user_id"] for m in response.json()["members"] if m["is_lead"]]
    assert leads == [str(a.loner.id)]

    # A user can belong to more than one team.
    teams = await async_client.get(org_url(a, "/teams"), headers=auth(a.member))
    memberships = [
        t["name"]
        for t in teams.json()
        if str(a.member.id) in [m["user_id"] for m in t["members"]]
    ]
    assert sorted(memberships) == ["Growth", "Platform"]

    # Someone who isn't in the organization can't be added.
    response = await async_client.put(
        f"{url}/{world.b.member.id}", json={}, headers=auth(a.admin)
    )
    assert response.status_code == 404

    response = await async_client.delete(f"{url}/{a.member.id}", headers=auth(a.admin))
    assert response.status_code == 204


@pytest.mark.asyncio
async def test_team_week_access(async_client, world):
    a = world.a
    url = org_url(a, f"/teams/{a.team.id}/weeks/{current_monday()}")
    assert (await async_client.get(url, headers=auth(a.member))).status_code == 403
    assert (await async_client.get(url, headers=auth(a.loner))).status_code == 403
    assert (await async_client.get(url, headers=auth(a.lead))).status_code == 200
    assert (await async_client.get(url, headers=auth(a.owner))).status_code == 200

    tuesday = current_monday() + timedelta(days=1)
    response = await async_client.get(
        org_url(a, f"/teams/{a.team.id}/weeks/{tuesday}"), headers=auth(a.lead)
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_team_week_at_a_glance(async_client, world, session_factory):
    a = world.a
    week = current_monday()
    approved = await add_plan(
        session_factory,
        org=a.org,
        user=a.member,
        status=PlanStatus.APPROVED,
        done_tasks=2,
    )
    await add_plan(session_factory, org=a.org, user=a.teammate, status=PlanStatus.DRAFT)

    response = await async_client.get(
        org_url(a, f"/teams/{a.team.id}/weeks/{week}"), headers=auth(a.lead)
    )
    assert response.status_code == 200
    rows = {m["user_id"]: m for m in response.json()["members"]}

    member = rows[str(a.member.id)]
    assert member["status"] == "approved"
    assert member["plan_id"] == str(approved.id)
    assert (member["tasks_done"], member["tasks_total"]) == (2, 3)
    assert member["main_task_title"].startswith("Checkout handles")

    # A draft is private: status only.
    teammate = rows[str(a.teammate.id)]
    assert teammate["status"] == "draft"
    assert teammate["plan_id"] is None
    assert teammate["main_task_title"] is None
    assert teammate["tasks_total"] is None

    lead = rows[str(a.lead.id)]
    assert lead["status"] == "not_started" and lead["is_lead"] is True


@pytest.mark.asyncio
async def test_team_history(async_client, world, session_factory):
    a = world.a
    this_week = current_monday()
    last_week = this_week - timedelta(days=7)
    for user, shipped in ((a.member, True), (a.teammate, False)):
        await add_plan(
            session_factory,
            org=a.org,
            user=user,
            week_start=last_week,
            status=PlanStatus.DONE,
            shipped=shipped,
        )
    await add_plan(
        session_factory, org=a.org, user=a.member, status=PlanStatus.SUBMITTED
    )
    # Plans of people outside the team don't count.
    await add_plan(
        session_factory,
        org=a.org,
        user=a.loner,
        week_start=last_week,
        status=PlanStatus.DONE,
        shipped=True,
    )

    response = await async_client.get(
        org_url(a, f"/teams/{a.team.id}/weeks"), headers=auth(a.lead)
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    current, previous = body["items"]
    assert current["week_start"] == str(this_week)
    assert (current["submitted"], current["approved"], current["shipped"]) == (1, 0, 0)
    assert previous["week_start"] == str(last_week)
    assert (previous["closed"], previous["shipped"], previous["member_count"]) == (
        2,
        1,
        3,
    )
