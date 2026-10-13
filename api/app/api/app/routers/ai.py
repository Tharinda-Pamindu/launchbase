from fastapi import APIRouter

from app.api.app.access import CurrentOrg, CurrentUser
from app.api.app.schemas import AiStatusResponse, PlanDraftRequest, PlanDraftResponse
from app.config import settings
from app.database import DBSession
from app.services.ai import AiService

router = APIRouter()


@router.get("/ai/status", tags=["ai"])
async def ai_status(current_user: CurrentUser) -> AiStatusResponse:
    """Whether the AI features are switched on, so the UI can hide them
    instead of offering buttons that can only fail."""
    return AiStatusResponse(available=bool(settings.GOOGLE_API_KEY))


@router.post("/organizations/{organization_id}/ai/plan-drafts", tags=["ai"])
async def plan_draft_create(
    org: CurrentOrg, session: DBSession, data: PlanDraftRequest
) -> PlanDraftResponse:
    """Turn messy notes into a draft plan for the form. Nothing is saved: the
    member edits the draft and saves it as a plan themselves."""
    try:
        draft = await AiService(session).draft_plan(org.membership, data.notes)
    finally:
        # Only the usage record is written.
        await session.commit()
    return PlanDraftResponse.model_validate(draft.model_dump())
