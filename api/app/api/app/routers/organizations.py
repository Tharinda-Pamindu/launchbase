import uuid

from fastapi import APIRouter, status

from app.api.app.access import CurrentOrg, CurrentUser
from app.api.app.schemas import (
    InviteCreatedResponse,
    InviteCreateRequest,
    InviteResponse,
    MemberResponse,
    MemberUpdateRequest,
    OrganizationCreateRequest,
    OrganizationResponse,
    OrganizationUpdateRequest,
)
from app.config import settings
from app.database import DBSession
from app.models import Organization, OrganizationInvite, OrganizationMembership
from app.services.organizations import InviteService, OrganizationService

router = APIRouter()


def organization_response(
    organization: Organization, membership: OrganizationMembership
) -> OrganizationResponse:
    return OrganizationResponse(
        id=organization.id,
        name=organization.name,
        created_at=organization.created_at,
        role=membership.role,  # pyright: ignore[reportArgumentType]
        is_suspended=organization.suspended_at is not None,
    )


def member_response(membership: OrganizationMembership) -> MemberResponse:
    return MemberResponse(
        id=membership.id,
        user_id=membership.user_id,
        first_name=membership.user.first_name,
        last_name=membership.user.last_name,
        email=membership.user.email,
        role=membership.role,  # pyright: ignore[reportArgumentType]
        joined_at=membership.created_at,
    )


def invite_response(invite: OrganizationInvite) -> InviteResponse:
    return InviteResponse(
        id=invite.id,
        email=invite.email,
        role=invite.role,  # pyright: ignore[reportArgumentType]
        created_at=invite.created_at,
        expires_at=invite.expires_at,
        invited_by=(
            f"{invite.created_by.first_name} {invite.created_by.last_name}"
            if invite.created_by
            else None
        ),
    )


@router.get("/organizations", tags=["organizations"])
async def organization_list(
    current_user: CurrentUser, session: DBSession
) -> list[OrganizationResponse]:
    """Organizations the caller belongs to, including suspended ones so the UI
    can say why they're locked."""
    rows = await OrganizationService(session).list_for_user(current_user.id)
    return [organization_response(o, m) for m, o in rows]


@router.post(
    "/organizations", status_code=status.HTTP_201_CREATED, tags=["organizations"]
)
async def organization_create(
    current_user: CurrentUser, session: DBSession, data: OrganizationCreateRequest
) -> OrganizationResponse:
    membership = await OrganizationService(session).create(
        owner=current_user, name=data.name
    )
    await session.commit()
    return organization_response(membership.organization, membership)


@router.get("/organizations/{organization_id}", tags=["organizations"])
async def organization_get(org: CurrentOrg) -> OrganizationResponse:
    return organization_response(org.organization, org.membership)


@router.patch("/organizations/{organization_id}", tags=["organizations"])
async def organization_update(
    org: CurrentOrg, session: DBSession, data: OrganizationUpdateRequest
) -> OrganizationResponse:
    org.require_manager()
    organization = await OrganizationService(session).rename(
        org.organization, data.name
    )
    await session.commit()
    return organization_response(organization, org.membership)


@router.delete(
    "/organizations/{organization_id}/membership",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["organizations"],
)
async def organization_leave(org: CurrentOrg, session: DBSession) -> None:
    await OrganizationService(session).leave(org.membership)
    await session.commit()


@router.get("/organizations/{organization_id}/members", tags=["members"])
async def member_list(org: CurrentOrg, session: DBSession) -> list[MemberResponse]:
    members = await OrganizationService(session).list_members(org.organization_id)
    return [member_response(m) for m in members]


@router.patch(
    "/organizations/{organization_id}/members/{membership_id}", tags=["members"]
)
async def member_update(
    org: CurrentOrg,
    session: DBSession,
    membership_id: uuid.UUID,
    data: MemberUpdateRequest,
) -> MemberResponse:
    service = OrganizationService(session)
    target = await service.get_member(org.organization_id, membership_id)
    target = await service.change_role(org.membership, target, data.role)
    await session.commit()
    return member_response(target)


@router.delete(
    "/organizations/{organization_id}/members/{membership_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["members"],
)
async def member_remove(
    org: CurrentOrg, session: DBSession, membership_id: uuid.UUID
) -> None:
    service = OrganizationService(session)
    target = await service.get_member(org.organization_id, membership_id)
    await service.remove_member(org.membership, target)
    await session.commit()


@router.get("/organizations/{organization_id}/invites", tags=["invites"])
async def invite_list(org: CurrentOrg, session: DBSession) -> list[InviteResponse]:
    org.require_manager()
    invites = await InviteService(session).list_pending(org.organization_id)
    return [invite_response(i) for i in invites]


@router.post(
    "/organizations/{organization_id}/invites",
    status_code=status.HTTP_201_CREATED,
    tags=["invites"],
)
async def invite_create(
    org: CurrentOrg, session: DBSession, data: InviteCreateRequest
) -> InviteCreatedResponse:
    org.require_manager()
    invite, token = await InviteService(session).create(
        organization_id=org.organization_id,
        created_by=org.user,
        email=data.email,
        role=data.role,
    )
    await session.commit()
    return InviteCreatedResponse(
        **invite_response(invite).model_dump(),
        token=token,
        invite_url=f"{settings.APP_URL.rstrip('/')}/invites/{token}",
    )


@router.delete(
    "/organizations/{organization_id}/invites/{invite_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["invites"],
)
async def invite_revoke(
    org: CurrentOrg, session: DBSession, invite_id: uuid.UUID
) -> None:
    org.require_manager()
    await InviteService(session).revoke(org.organization_id, invite_id)
    await session.commit()
