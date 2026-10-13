import uuid
from typing import Literal

from fastapi import APIRouter, Query

from app.api.internal.access import CurrentInternalUser
from app.api.internal.schemas import (
    AiUsageEventResponse,
    AiUsageEventsListResponse,
    AiUsageOrganizationResponse,
    AiUsageSummaryResponse,
)
from app.database import DBSession
from app.services.platform import PlatformService

router = APIRouter()


@router.get("/ai-usage/summary", tags=["ai-usage"])
async def ai_usage_summary(
    current_user: CurrentInternalUser,
    session: DBSession,
    days: int = Query(30, ge=1, le=365),
) -> AiUsageSummaryResponse:
    """AI calls per organization over the last `days`: what the feature costs
    (tokens) and where it breaks (failures, rate limits)."""
    rows = await PlatformService(session).ai_usage_by_organization(days=days)
    organizations = [
        AiUsageOrganizationResponse.model_validate(r._mapping) for r in rows
    ]
    totals = {
        field: sum(getattr(o, field) for o in organizations)
        for field in (
            "calls",
            "succeeded",
            "failed",
            "rate_limited",
            "input_tokens",
            "output_tokens",
        )
    }
    return AiUsageSummaryResponse(days=days, organizations=organizations, **totals)


@router.get("/ai-usage/events", tags=["ai-usage"])
async def ai_usage_event_list(
    current_user: CurrentInternalUser,
    session: DBSession,
    organization_id: uuid.UUID | None = None,
    outcome: Literal["succeeded", "failed", "rate_limited"] | None = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> AiUsageEventsListResponse:
    rows, total = await PlatformService(session).ai_usage_events(
        organization_id=organization_id, outcome=outcome, limit=limit, offset=offset
    )
    return AiUsageEventsListResponse(
        items=[
            AiUsageEventResponse(
                id=event.id,
                created_at=event.created_at,
                organization_id=event.organization_id,
                organization_name=organization_name,
                user_id=event.user_id,
                operation=event.operation,
                outcome=event.outcome,
                error_kind=event.error_kind,
                model=event.model,
                latency_ms=event.latency_ms,
                input_tokens=event.input_tokens,
                output_tokens=event.output_tokens,
            )
            for event, organization_name in rows
        ],
        total=total,
        limit=limit,
        offset=offset,
    )
