from fastapi import APIRouter

from app.api.app.access import CurrentUser
from app.api.app.routers.organizations import organization_response
from app.api.app.schemas import InvitePreviewResponse, OrganizationResponse
from app.database import DBSession
from app.services.organizations import InviteService, invite_status

router = APIRouter()


@router.get("/invites/{token}", tags=["invites"])
async def invite_preview(token: str, session: DBSession) -> InvitePreviewResponse:
    """Public: what an invite link is for, so the page can say "Join X" before
    the person signs up or logs in. The token itself is the secret."""
    invite = await InviteService(session).get_by_token(token)
    return InvitePreviewResponse(
        organization_name=invite.organization.name,
        email=invite.email,
        role=invite.role,  # pyright: ignore[reportArgumentType]
        invited_by=(
            f"{invite.created_by.first_name} {invite.created_by.last_name}"
            if invite.created_by
            else None
        ),
        status=invite_status(invite),  # pyright: ignore[reportArgumentType]
        expires_at=invite.expires_at,
    )


@router.post("/invites/{token}/accept", tags=["invites"])
async def invite_accept(
    token: str, current_user: CurrentUser, session: DBSession
) -> OrganizationResponse:
    membership = await InviteService(session).accept(token=token, user=current_user)
    await session.commit()
    return organization_response(membership.organization, membership)
