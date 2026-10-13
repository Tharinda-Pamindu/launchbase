"""Cross-organization access: requests made with someone else's IDs.

Every org-scoped route is reached through the caller's own membership, so a
foreign organization, team, plan or member looks exactly like one that
doesn't exist (404), and nothing changes.
"""

from datetime import UTC, datetime

import pytest
from fastapi.routing import APIRoute
from sqlalchemy import select

from app.api.app.access import get_current_http_user, get_org_context
from app.main import app_api
from app.models import Organization, PlanStatus, TeamMembership, WeeklyPlan
from tests.factories import add_plan, auth

PUBLIC_ROUTES = {"/health", "/auth", "/signup", "/logout", "/invites/{token}"}


def _dependency_calls(route: APIRoute) -> set:
    calls, stack = set(), list(route.dependant.dependencies)
    while stack:
        dependant = stack.pop()
        calls.add(dependant.call)
        stack.extend(dependant.dependencies)
    return calls


def test_every_route_is_authenticated_and_org_routes_are_scoped():
    """A new route can't forget the tenancy guard without failing here."""
    routes = [r for r in app_api.routes if isinstance(r, APIRoute)]
    assert routes
    for route in routes:
        calls = _dependency_calls(route)
        if route.path not in PUBLIC_ROUTES:
            assert get_current_http_user in calls, f"{route.path} is unauthenticated"
        if "{organization_id}" in route.path:
            assert get_org_context in calls, f"{route.path} skips OrgContext"


@pytest.mark.asyncio
async def test_foreign_org_reads_are_not_found(async_client, world, session_factory):
    a, b = world.a, world.b
    plan = await add_plan(
        session_factory, org=a.org, user=a.member, status=PlanStatus.SUBMITTED
    )
    org = f"/app/organizations/{a.org.id}"
    paths = [
        org,
        f"{org}/members",
        f"{org}/teams",
        f"{org}/teams/{a.team.id}",
        f"{org}/teams/{a.team.id}/weeks/{plan.week_start}",
        f"{org}/teams/{a.team.id}/weeks",
        f"{org}/plans",
        f"{org}/plans/{plan.id}",
        f"{org}/approvals",
        f"{org}/invites",
    ]
    # Even B's owner, and B's lead, see nothing of A.
    for outsider in (b.owner, b.lead):
        for path in paths:
            response = await async_client.get(path, headers=auth(outsider))
            assert response.status_code == 404, path


@pytest.mark.asyncio
async def test_foreign_ids_inside_own_org_are_not_found(
    async_client, world, session_factory
):
    """B's owner uses their own org in the URL but A's team, plan and member ids."""
    a, b = world.a, world.b
    plan = await add_plan(
        session_factory, org=a.org, user=a.member, status=PlanStatus.SUBMITTED
    )
    own = f"/app/organizations/{b.org.id}"
    headers = auth(b.owner)

    for path in (
        f"{own}/teams/{a.team.id}",
        f"{own}/plans/{plan.id}",
        f"{own}/teams/{a.team.id}/weeks/{plan.week_start}",
    ):
        assert (await async_client.get(path, headers=headers)).status_code == 404

    a_member_id = await _membership_id(async_client, a, a.member)
    writes = [
        ("patch", f"{own}/teams/{a.team.id}", {"name": "Hijacked"}),
        ("delete", f"{own}/teams/{a.team.id}", None),
        ("put", f"{own}/teams/{b.team.id}/members/{a.member.id}", {"is_lead": True}),
        ("put", f"{own}/teams/{a.team.id}/members/{b.member.id}", {}),
        ("patch", f"{own}/members/{a_member_id}", {"role": "admin"}),
        ("delete", f"{own}/members/{a_member_id}", None),
        ("put", f"{own}/plans/{plan.id}", {"tasks": []}),
        ("post", f"{own}/plans/{plan.id}/approve", {}),
        ("post", f"{own}/plans/{plan.id}/request-changes", {"comment": "no"}),
        ("post", f"{own}/plans/{plan.id}/ai-review", None),
    ]
    for method, path, body in writes:
        kwargs = {"headers": headers}
        if body is not None:
            kwargs["json"] = body
        response = await getattr(async_client, method)(path, **kwargs)
        assert response.status_code == 404, (method, path, response.text)

    # And nothing in A changed.
    async with session_factory() as db:
        stored = await db.get(WeeklyPlan, plan.id)
        assert stored is not None and stored.status == PlanStatus.SUBMITTED
        a_team_members = (
            await db.scalars(
                select(TeamMembership.user_id).where(
                    TeamMembership.team_id == a.team.id
                )
            )
        ).all()
        assert b.member.id not in a_team_members
    team = await async_client.get(
        f"/app/organizations/{a.org.id}/teams/{a.team.id}", headers=auth(a.owner)
    )
    assert team.json()["name"] == "Platform"


async def _membership_id(async_client, org_world, user) -> str:
    response = await async_client.get(
        f"/app/organizations/{org_world.org.id}/members",
        headers=auth(org_world.owner),
    )
    return next(m["id"] for m in response.json() if m["user_id"] == str(user.id))


@pytest.mark.asyncio
async def test_org_list_only_shows_own_orgs(async_client, world):
    response = await async_client.get(
        "/app/organizations", headers=auth(world.a.member)
    )
    assert response.status_code == 200
    assert [o["id"] for o in response.json()] == [str(world.a.org.id)]
    assert response.json()[0]["role"] == "member"


@pytest.mark.asyncio
async def test_suspended_org_locks_members_out(async_client, world, session_factory):
    a = world.a
    async with session_factory() as db:
        org = await db.get(Organization, a.org.id)
        assert org is not None
        org.suspended_at = datetime.now(UTC)
        await db.commit()

    response = await async_client.get(
        f"/app/organizations/{a.org.id}/plans", headers=auth(a.owner)
    )
    assert response.status_code == 403
    assert response.json()["detail"][0]["type"] == "organization_suspended"

    # Still listed, flagged, so the UI can explain.
    listed = await async_client.get("/app/organizations", headers=auth(a.owner))
    assert listed.json()[0]["is_suspended"] is True

    # Other organizations are unaffected.
    other = await async_client.get(
        f"/app/organizations/{world.b.org.id}/plans", headers=auth(world.b.member)
    )
    assert other.status_code == 200


@pytest.mark.asyncio
async def test_app_token_cannot_reach_internal_surface(async_client, world):
    """A customer org owner or org admin is not platform staff."""
    for user in (world.a.owner, world.a.admin):
        response = await async_client.get("/internal/organizations", headers=auth(user))
        assert response.status_code == 401
