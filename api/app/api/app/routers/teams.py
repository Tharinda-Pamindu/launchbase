import uuid
from datetime import date

from fastapi import APIRouter, Query, status

from app.api.app.access import CurrentOrg
from app.api.app.schemas import (
    MemberWeekResponse,
    TeamCreateRequest,
    TeamMemberRequest,
    TeamMemberResponse,
    TeamResponse,
    TeamUpdateRequest,
    TeamWeekResponse,
    TeamWeekSummaryResponse,
)
from app.database import DBSession
from app.models import PlanStatus, TaskKind, Team
from app.schemas import Page
from app.services.plans import MemberWeek, PlanService
from app.services.teams import TeamService

router = APIRouter()


def team_response(team: Team) -> TeamResponse:
    members = sorted(
        team.memberships,
        key=lambda m: (not m.is_lead, m.user.first_name, m.user.last_name),
    )
    return TeamResponse(
        id=team.id,
        name=team.name,
        description=team.description,
        created_at=team.created_at,
        members=[
            TeamMemberResponse(
                user_id=m.user_id,
                first_name=m.user.first_name,
                last_name=m.user.last_name,
                is_lead=m.is_lead,
            )
            for m in members
        ],
    )


def member_week_response(row: MemberWeek) -> MemberWeekResponse:
    user, plan = row.membership.user, row.plan
    # Someone else's draft is private: only its status shows.
    visible = plan is not None and (plan.status != PlanStatus.DRAFT or row.readable)
    main = (
        next((t for t in plan.tasks if t.kind == TaskKind.MAIN), None)
        if plan is not None and row.readable
        else None
    )
    return MemberWeekResponse(
        user_id=user.id,
        first_name=user.first_name,
        last_name=user.last_name,
        is_lead=row.membership.is_lead,
        status=plan.status if plan else "not_started",  # pyright: ignore[reportArgumentType]
        plan_id=plan.id if plan is not None and row.readable else None,
        main_task_title=main.title if main else None,
        tasks_done=sum(t.is_done for t in plan.tasks) if plan and visible else None,
        tasks_total=len(plan.tasks) if plan and visible else None,
        main_goal_shipped=plan.main_goal_shipped if plan else None,
    )


@router.get("/organizations/{organization_id}/teams", tags=["teams"])
async def team_list(org: CurrentOrg, session: DBSession) -> list[TeamResponse]:
    teams = await TeamService(session).list(org.organization_id)
    return [team_response(t) for t in teams]


@router.post(
    "/organizations/{organization_id}/teams",
    status_code=status.HTTP_201_CREATED,
    tags=["teams"],
)
async def team_create(
    org: CurrentOrg, session: DBSession, data: TeamCreateRequest
) -> TeamResponse:
    org.require_manager()
    team = await TeamService(session).create(
        org.organization_id, name=data.name, description=data.description
    )
    await session.commit()
    return team_response(team)


@router.get("/organizations/{organization_id}/teams/{team_id}", tags=["teams"])
async def team_get(
    org: CurrentOrg, session: DBSession, team_id: uuid.UUID
) -> TeamResponse:
    return team_response(await TeamService(session).get(org.organization_id, team_id))


@router.patch("/organizations/{organization_id}/teams/{team_id}", tags=["teams"])
async def team_update(
    org: CurrentOrg, session: DBSession, team_id: uuid.UUID, data: TeamUpdateRequest
) -> TeamResponse:
    org.require_manager()
    service = TeamService(session)
    team = await service.get(org.organization_id, team_id)
    team = await service.update(team, data.model_dump(exclude_unset=True))
    await session.commit()
    return team_response(team)


@router.delete(
    "/organizations/{organization_id}/teams/{team_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["teams"],
)
async def team_delete(org: CurrentOrg, session: DBSession, team_id: uuid.UUID) -> None:
    org.require_manager()
    service = TeamService(session)
    await service.delete(await service.get(org.organization_id, team_id))
    await session.commit()


@router.put(
    "/organizations/{organization_id}/teams/{team_id}/members/{user_id}",
    tags=["teams"],
)
async def team_member_set(
    org: CurrentOrg,
    session: DBSession,
    team_id: uuid.UUID,
    user_id: uuid.UUID,
    data: TeamMemberRequest,
) -> TeamResponse:
    """Add an org member to the team, or change whether they lead it."""
    org.require_manager()
    service = TeamService(session)
    team = await service.get(org.organization_id, team_id)
    team = await service.set_member(team, user_id=user_id, is_lead=data.is_lead)
    await session.commit()
    return team_response(team)


@router.delete(
    "/organizations/{organization_id}/teams/{team_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["teams"],
)
async def team_member_remove(
    org: CurrentOrg, session: DBSession, team_id: uuid.UUID, user_id: uuid.UUID
) -> None:
    org.require_manager()
    service = TeamService(session)
    team = await service.get(org.organization_id, team_id)
    await service.remove_member(team, user_id)
    await session.commit()


@router.get(
    "/organizations/{organization_id}/teams/{team_id}/weeks/{week_start}",
    tags=["teams"],
)
async def team_week_get(
    org: CurrentOrg, session: DBSession, team_id: uuid.UUID, week_start: date
) -> TeamWeekResponse:
    """The team's week at a glance: who has submitted, what's approved, tasks
    done and whether the main goal shipped."""
    team = await TeamService(session).get(org.organization_id, team_id)
    rows = await PlanService(session).team_week(org.membership, team, week_start)
    return TeamWeekResponse(
        team_id=team.id,
        team_name=team.name,
        week_start=week_start,
        members=[member_week_response(r) for r in rows],
    )


@router.get("/organizations/{organization_id}/teams/{team_id}/weeks", tags=["teams"])
async def team_week_list(
    org: CurrentOrg,
    session: DBSession,
    team_id: uuid.UUID,
    limit: int = Query(12, ge=1, le=52),
    offset: int = Query(0, ge=0),
) -> Page[TeamWeekSummaryResponse]:
    """History: one row per past week for the team's current members."""
    team = await TeamService(session).get(org.organization_id, team_id)
    weeks, total = await PlanService(session).team_history(
        org.membership, team, limit=limit, offset=offset
    )
    return Page(
        items=[TeamWeekSummaryResponse(**w) for w in weeks],
        total=total,
        limit=limit,
        offset=offset,
    )
