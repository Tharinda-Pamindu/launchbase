import uuid
from typing import Any, Literal

from fastapi import APIRouter, Query

from app.api.internal.access import CurrentInternalUser
from app.api.internal.schemas import (
    OrganizationDetailResponse,
    OrganizationMemberResponse,
    OrganizationsListResponse,
    OrganizationSummaryResponse,
    OrganizationSuspendRequest,
    OrganizationTeamResponse,
)
from app.database import DBSession
from app.services.platform import PlatformService

router = APIRouter()


def summary_fields(row: Any) -> dict[str, Any]:
    organization = row.Organization
    return {
        "id": organization.id,
        "name": organization.name,
        "created_at": organization.created_at,
        "suspended_at": organization.suspended_at,
        "suspended_reason": organization.suspended_reason,
        "member_count": row.member_count,
        "team_count": row.team_count,
        "plan_count": row.plan_count,
        "last_active_at": row.last_active_at,
    }


async def organization_detail(
    service: PlatformService, organization_id: uuid.UUID
) -> OrganizationDetailResponse:
    row = await service.get_organization(organization_id)
    members = await service.organization_members(organization_id)
    teams = await service.organization_teams(organization_id)
    return OrganizationDetailResponse(
        **summary_fields(row),
        members=[
            OrganizationMemberResponse(
                user_id=m.user_id,
                first_name=m.user.first_name,
                last_name=m.user.last_name,
                email=m.user.email,
                role=m.role,  # pyright: ignore[reportArgumentType]
                is_active=m.user.is_active,
                joined_at=m.created_at,
            )
            for m in members
        ],
        teams=[
            OrganizationTeamResponse(
                id=t.id,
                name=t.name,
                member_count=len(t.memberships),
                lead_name=next(
                    (
                        f"{m.user.first_name} {m.user.last_name}"
                        for m in t.memberships
                        if m.is_lead
                    ),
                    None,
                ),
            )
            for t in teams
        ],
    )


@router.get("/organizations", tags=["organizations"])
async def organization_list(
    current_user: CurrentInternalUser,
    session: DBSession,
    q: str | None = Query(None, max_length=100),
    status: Literal["active", "suspended"] | None = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> OrganizationsListResponse:
    rows, total = await PlatformService(session).list_organizations(
        q=q, status=status, limit=limit, offset=offset
    )
    return OrganizationsListResponse(
        items=[OrganizationSummaryResponse(**summary_fields(r)) for r in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/organizations/{organization_id}", tags=["organizations"])
async def organization_get(
    current_user: CurrentInternalUser, session: DBSession, organization_id: uuid.UUID
) -> OrganizationDetailResponse:
    """Metadata only: who's in it and how it's organized, never plan content."""
    return await organization_detail(PlatformService(session), organization_id)


@router.post("/organizations/{organization_id}/suspend", tags=["organizations"])
async def organization_suspend(
    current_user: CurrentInternalUser,
    session: DBSession,
    organization_id: uuid.UUID,
    data: OrganizationSuspendRequest,
) -> OrganizationDetailResponse:
    """Lock every member out of the organization until it's reinstated."""
    service = PlatformService(session)
    await service.suspend(organization_id, data.reason)
    await session.commit()
    return await organization_detail(service, organization_id)


@router.post("/organizations/{organization_id}/reinstate", tags=["organizations"])
async def organization_reinstate(
    current_user: CurrentInternalUser, session: DBSession, organization_id: uuid.UUID
) -> OrganizationDetailResponse:
    service = PlatformService(session)
    await service.reinstate(organization_id)
    await session.commit()
    return await organization_detail(service, organization_id)
