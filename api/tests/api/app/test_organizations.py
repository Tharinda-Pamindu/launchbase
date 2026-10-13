import uuid
from datetime import UTC, datetime

import pytest

from app.models import Organization
from tests.factories import auth


def org_url(org_world, suffix: str = "") -> str:
    return f"/app/organizations/{org_world.org.id}{suffix}"


async def member_id(async_client, org_world, user) -> str:
    response = await async_client.get(
        org_url(org_world, "/members"), headers=auth(org_world.owner)
    )
    return next(m["id"] for m in response.json() if m["user_id"] == str(user.id))


@pytest.mark.asyncio
async def test_signup_then_create_org_makes_owner(async_client):
    signup = await async_client.post(
        "/app/signup",
        json={
            "first_name": "Nadia",
            "last_name": "Perera",
            "email": f"nadia.{uuid.uuid4().hex}@example.com",
            "password": "testpassword123",
        },
    )
    assert signup.status_code == 201

    created = await async_client.post("/app/organizations", json={"name": "Lighthouse"})
    assert created.status_code == 201
    assert created.json()["role"] == "owner"

    members = await async_client.get(
        f"/app/organizations/{created.json()['id']}/members"
    )
    assert [m["role"] for m in members.json()] == ["owner"]


@pytest.mark.asyncio
async def test_only_managers_rename_org(async_client, world):
    a = world.a
    denied = await async_client.patch(
        org_url(a), json={"name": "Mine now"}, headers=auth(a.member)
    )
    assert denied.status_code == 403
    assert denied.json()["detail"][0]["type"] == "org_admin_required"

    allowed = await async_client.patch(
        org_url(a), json={"name": "Acme Renamed"}, headers=auth(a.admin)
    )
    assert allowed.status_code == 200
    assert allowed.json()["name"] == "Acme Renamed"


@pytest.mark.asyncio
async def test_role_changes(async_client, world):
    a = world.a
    member = await member_id(async_client, a, a.member)
    owner = await member_id(async_client, a, a.owner)

    # A member can't change roles, not even their own.
    response = await async_client.patch(
        org_url(a, f"/members/{member}"), json={"role": "admin"}, headers=auth(a.member)
    )
    assert response.status_code == 403

    # An org admin can promote a member to admin, but not to owner.
    response = await async_client.patch(
        org_url(a, f"/members/{member}"), json={"role": "owner"}, headers=auth(a.admin)
    )
    assert response.status_code == 403
    response = await async_client.patch(
        org_url(a, f"/members/{member}"), json={"role": "admin"}, headers=auth(a.admin)
    )
    assert response.status_code == 200 and response.json()["role"] == "admin"

    # An org admin can't demote the owner.
    response = await async_client.patch(
        org_url(a, f"/members/{owner}"), json={"role": "member"}, headers=auth(a.admin)
    )
    assert response.status_code == 403

    # The last owner can't demote themselves.
    response = await async_client.patch(
        org_url(a, f"/members/{owner}"), json={"role": "member"}, headers=auth(a.owner)
    )
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_removing_members_and_leaving(async_client, world):
    a = world.a
    admin = await member_id(async_client, a, a.admin)
    member = await member_id(async_client, a, a.member)

    # Org admins remove members only.
    response = await async_client.delete(
        org_url(a, f"/members/{admin}"), headers=auth(a.admin)
    )
    assert response.status_code == 403

    response = await async_client.delete(
        org_url(a, f"/members/{member}"), headers=auth(a.admin)
    )
    assert response.status_code == 204
    # Gone from the org and its team, and locked out of the org.
    team = await async_client.get(
        org_url(a, f"/teams/{a.team.id}"), headers=auth(a.owner)
    )
    assert str(a.member.id) not in [m["user_id"] for m in team.json()["members"]]
    response = await async_client.get(org_url(a), headers=auth(a.member))
    assert response.status_code == 404

    # The last owner can't leave; anyone else can.
    response = await async_client.delete(
        org_url(a, "/membership"), headers=auth(a.owner)
    )
    assert response.status_code == 409
    response = await async_client.delete(
        org_url(a, "/membership"), headers=auth(a.loner)
    )
    assert response.status_code == 204


@pytest.mark.asyncio
async def test_invite_flow(async_client, world):
    a = world.a
    email = f"newhire.{uuid.uuid4().hex}@example.com"

    # Members can't invite.
    response = await async_client.post(
        org_url(a, "/invites"), json={"email": email}, headers=auth(a.member)
    )
    assert response.status_code == 403

    created = await async_client.post(
        org_url(a, "/invites"),
        json={"email": email, "role": "member"},
        headers=auth(a.admin),
    )
    assert created.status_code == 201
    token = created.json()["token"]
    assert created.json()["invite_url"].endswith(f"/invites/{token}")

    # Anyone with the link can preview it, without logging in.
    preview = await async_client.get(f"/app/invites/{token}")
    assert preview.status_code == 200
    assert preview.json()["organization_name"] == a.org.name
    assert preview.json()["status"] == "pending"

    # Someone else can't use it.
    response = await async_client.post(
        f"/app/invites/{token}/accept", headers=auth(world.b.member)
    )
    assert response.status_code == 403
    assert response.json()["detail"][0]["type"] == "invite_email_mismatch"

    # The invited person signs up and accepts.
    signup = await async_client.post(
        "/app/signup",
        json={
            "first_name": "New",
            "last_name": "Hire",
            "email": email.upper(),
            "password": "testpassword123",
        },
    )
    assert signup.status_code == 201
    accepted = await async_client.post(f"/app/invites/{token}/accept")
    assert accepted.status_code == 200
    assert accepted.json()["id"] == str(a.org.id)
    assert accepted.json()["role"] == "member"

    # The link is single-use.
    again = await async_client.post(f"/app/invites/{token}/accept")
    assert again.status_code == 410

    # Inviting someone who is already a member is a conflict.
    response = await async_client.post(
        org_url(a, "/invites"), json={"email": email}, headers=auth(a.owner)
    )
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_revoked_invite_cannot_be_used(async_client, world):
    a = world.a
    created = await async_client.post(
        org_url(a, "/invites"),
        json={"email": world.b.member.email},
        headers=auth(a.owner),
    )
    invite_id, token = created.json()["id"], created.json()["token"]

    listed = await async_client.get(org_url(a, "/invites"), headers=auth(a.owner))
    assert invite_id in [i["id"] for i in listed.json()]
    assert "token" not in listed.json()[0]

    response = await async_client.delete(
        org_url(a, f"/invites/{invite_id}"), headers=auth(a.owner)
    )
    assert response.status_code == 204

    response = await async_client.post(
        f"/app/invites/{token}/accept", headers=auth(world.b.member)
    )
    assert response.status_code == 410


@pytest.mark.asyncio
async def test_invite_into_suspended_org_is_refused(
    async_client, world, session_factory
):
    a = world.a
    created = await async_client.post(
        org_url(a, "/invites"),
        json={"email": world.b.member.email},
        headers=auth(a.owner),
    )
    async with session_factory() as db:
        org = await db.get(Organization, a.org.id)
        assert org is not None
        org.suspended_at = datetime.now(UTC)
        await db.commit()

    response = await async_client.post(
        f"/app/invites/{created.json()['token']}/accept", headers=auth(world.b.member)
    )
    assert response.status_code == 403
