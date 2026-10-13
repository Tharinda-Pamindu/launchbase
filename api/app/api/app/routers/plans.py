import uuid
from datetime import date

from fastapi import APIRouter, Query, status

from app.api.app.access import CurrentOrg
from app.api.app.schemas import (
    AiReviewResponse,
    PlanApproveRequest,
    PlanCompleteRequest,
    PlanCreateRequest,
    PlanPermissions,
    PlanRequestChangesRequest,
    PlanResponse,
    PlanReviewEntryResponse,
    PlanUpdateRequest,
    TaskInputRequest,
    TaskResponse,
    TaskUpdateRequest,
)
from app.config import settings
from app.database import DBSession
from app.models import OrganizationMembership, PlanStatus, WeeklyPlan
from app.schemas import Page
from app.services.ai import AiService
from app.services.plans import PlanService, TaskInput, plan_content_hash

router = APIRouter()


def task_inputs(tasks: list[TaskInputRequest]) -> list[TaskInput]:
    return [TaskInput(**t.model_dump()) for t in tasks]


async def plan_response(
    service: PlanService, actor: OrganizationMembership, plan: WeeklyPlan
) -> PlanResponse:
    is_author = plan.user_id == actor.user_id
    is_draft = plan.status == PlanStatus.DRAFT
    can_review = plan.status == PlanStatus.SUBMITTED and await service.can_approve(
        actor, plan.user_id
    )
    ai_review = None
    if is_author and plan.ai_review and plan.ai_reviewed_at:
        ai_review = AiReviewResponse.model_validate(
            plan.ai_review
            | {
                "reviewed_at": plan.ai_reviewed_at,
                "is_stale": plan.ai_review_plan_hash != plan_content_hash(plan.tasks),
            }
        )
    return PlanResponse(
        id=plan.id,
        week_start=plan.week_start,
        status=plan.status,  # pyright: ignore[reportArgumentType]
        author_id=plan.user_id,
        author_name=f"{plan.user.first_name} {plan.user.last_name}",
        created_at=plan.created_at,
        submitted_at=plan.submitted_at,
        approved_at=plan.approved_at,
        completed_at=plan.completed_at,
        main_goal_shipped=plan.main_goal_shipped,
        outcome_note=plan.outcome_note,
        tasks=[TaskResponse.model_validate(t) for t in plan.tasks],
        reviews=[
            PlanReviewEntryResponse(
                id=r.id,
                action=r.action,  # pyright: ignore[reportArgumentType]
                comment=r.comment,
                reviewer_name=(
                    f"{r.reviewer.first_name} {r.reviewer.last_name}"
                    if r.reviewer
                    else None
                ),
                created_at=r.created_at,
            )
            for r in plan.reviews
        ],
        ai_review=ai_review,
        total_estimate_hours=sum(t.estimate_hours or 0 for t in plan.tasks),
        permissions=PlanPermissions(
            edit=is_author and is_draft,
            submit=is_author and is_draft,
            withdraw=is_author and plan.status == PlanStatus.SUBMITTED,
            review=can_review,
            tick_tasks=is_author and plan.status == PlanStatus.APPROVED,
            complete=is_author and plan.status == PlanStatus.APPROVED,
            ai_review=is_author
            and is_draft
            and bool(plan.tasks)
            and bool(settings.GOOGLE_API_KEY),
        ),
    )


@router.get("/organizations/{organization_id}/plans", tags=["plans"])
async def plan_list(
    org: CurrentOrg,
    session: DBSession,
    week_start: date | None = None,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> Page[PlanResponse]:
    """The caller's own plans, newest week first."""
    service = PlanService(session)
    plans, total = await service.list_mine(
        org.membership, week_start=week_start, limit=limit, offset=offset
    )
    return Page(
        items=[await plan_response(service, org.membership, p) for p in plans],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/organizations/{organization_id}/plans",
    status_code=status.HTTP_201_CREATED,
    tags=["plans"],
)
async def plan_create(
    org: CurrentOrg, session: DBSession, data: PlanCreateRequest
) -> PlanResponse:
    service = PlanService(session)
    plan = await service.create(
        org.membership, week_start=data.week_start, tasks=task_inputs(data.tasks)
    )
    await session.commit()
    return await plan_response(service, org.membership, plan)


@router.get("/organizations/{organization_id}/approvals", tags=["plans"])
async def approval_list(org: CurrentOrg, session: DBSession) -> list[PlanResponse]:
    """Submitted plans waiting for the caller's approval."""
    service = PlanService(session)
    plans = await service.list_awaiting_approval(org.membership)
    return [await plan_response(service, org.membership, p) for p in plans]


@router.get("/organizations/{organization_id}/plans/{plan_id}", tags=["plans"])
async def plan_get(
    org: CurrentOrg, session: DBSession, plan_id: uuid.UUID
) -> PlanResponse:
    service = PlanService(session)
    plan = await service.get(org.membership, plan_id)
    return await plan_response(service, org.membership, plan)


@router.put("/organizations/{organization_id}/plans/{plan_id}", tags=["plans"])
async def plan_update(
    org: CurrentOrg, session: DBSession, plan_id: uuid.UUID, data: PlanUpdateRequest
) -> PlanResponse:
    """Replace a draft's tasks with the list sent, in order."""
    service = PlanService(session)
    plan = await service.get(org.membership, plan_id)
    plan = await service.replace_tasks(org.membership, plan, task_inputs(data.tasks))
    await session.commit()
    return await plan_response(service, org.membership, plan)


@router.patch(
    "/organizations/{organization_id}/plans/{plan_id}/tasks/{task_id}",
    tags=["plans"],
)
async def plan_task_update(
    org: CurrentOrg,
    session: DBSession,
    plan_id: uuid.UUID,
    task_id: uuid.UUID,
    data: TaskUpdateRequest,
) -> TaskResponse:
    """Tick a task done (or undo it) during the week."""
    service = PlanService(session)
    plan = await service.get(org.membership, plan_id)
    task = await service.set_task_done(org.membership, plan, task_id, data.is_done)
    await session.commit()
    return TaskResponse.model_validate(task)


@router.post("/organizations/{organization_id}/plans/{plan_id}/submit", tags=["plans"])
async def plan_submit(
    org: CurrentOrg, session: DBSession, plan_id: uuid.UUID
) -> PlanResponse:
    service = PlanService(session)
    plan = await service.submit(
        org.membership, await service.get(org.membership, plan_id)
    )
    await session.commit()
    return await plan_response(service, org.membership, plan)


@router.post(
    "/organizations/{organization_id}/plans/{plan_id}/withdraw", tags=["plans"]
)
async def plan_withdraw(
    org: CurrentOrg, session: DBSession, plan_id: uuid.UUID
) -> PlanResponse:
    service = PlanService(session)
    plan = await service.withdraw(
        org.membership, await service.get(org.membership, plan_id)
    )
    await session.commit()
    return await plan_response(service, org.membership, plan)


@router.post("/organizations/{organization_id}/plans/{plan_id}/approve", tags=["plans"])
async def plan_approve(
    org: CurrentOrg,
    session: DBSession,
    plan_id: uuid.UUID,
    data: PlanApproveRequest,
) -> PlanResponse:
    service = PlanService(session)
    plan = await service.approve(
        org.membership, await service.get(org.membership, plan_id), data.comment
    )
    await session.commit()
    return await plan_response(service, org.membership, plan)


@router.post(
    "/organizations/{organization_id}/plans/{plan_id}/request-changes",
    tags=["plans"],
)
async def plan_request_changes(
    org: CurrentOrg,
    session: DBSession,
    plan_id: uuid.UUID,
    data: PlanRequestChangesRequest,
) -> PlanResponse:
    """Send a submitted plan back to its author with a comment."""
    service = PlanService(session)
    plan = await service.request_changes(
        org.membership, await service.get(org.membership, plan_id), data.comment
    )
    await session.commit()
    return await plan_response(service, org.membership, plan)


@router.post(
    "/organizations/{organization_id}/plans/{plan_id}/complete", tags=["plans"]
)
async def plan_complete(
    org: CurrentOrg,
    session: DBSession,
    plan_id: uuid.UUID,
    data: PlanCompleteRequest,
) -> PlanResponse:
    """Close the week and record whether the main task shipped."""
    service = PlanService(session)
    plan = await service.complete(
        org.membership,
        await service.get(org.membership, plan_id),
        main_goal_shipped=data.main_goal_shipped,
        outcome_note=data.outcome_note,
    )
    await session.commit()
    return await plan_response(service, org.membership, plan)


@router.post("/organizations/{organization_id}/plans/{plan_id}/ai-review", tags=["ai"])
async def plan_ai_review(
    org: CurrentOrg, session: DBSession, plan_id: uuid.UUID
) -> PlanResponse:
    """Run the AI reviewer on a draft. The review is stored on the plan and
    shown only to its author."""
    service = PlanService(session)
    plan = await service.get(org.membership, plan_id)
    try:
        await AiService(session).review_plan(org.membership, plan)
    finally:
        # Keeps the usage record even when the AI call failed.
        await session.commit()
    return await plan_response(service, org.membership, await service.reload(plan))
