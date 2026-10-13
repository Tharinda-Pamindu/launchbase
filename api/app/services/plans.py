import hashlib
import json
import uuid
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy import Select, and_, distinct, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from app.exceptions import (
    APIException,
    ConflictException,
    ForbiddenException,
    ResourceNotFoundException,
    ValidationException,
)
from app.models import (
    OrganizationMembership,
    OrgRole,
    PlanReview,
    PlanStatus,
    PlanTask,
    ReviewAction,
    TaskKind,
    Team,
    TeamMembership,
    WeeklyPlan,
)

MAX_TASKS = 15


def current_monday(today: date | None = None) -> date:
    today = today or datetime.now(UTC).date()
    return today - timedelta(days=today.weekday())


def plan_content_hash(tasks: Iterable[PlanTask]) -> str:
    """Fingerprint of what an AI review looked at, to tell when it's stale."""
    content = [
        [str(t.id), t.kind, t.title, t.why, t.estimate_hours]
        for t in sorted(tasks, key=lambda t: t.position)
    ]
    return hashlib.sha256(json.dumps(content).encode()).hexdigest()


def invalid_status(plan: WeeklyPlan, expected: str, action: str) -> APIException:
    return APIException(
        status_code=409,
        code="INVALID_PLAN_STATUS",
        message=f"Only a {expected} plan can be {action}. This plan is {plan.status}.",
    )


@dataclass
class TaskInput:
    kind: str
    title: str
    why: str | None = None
    estimate_hours: int | None = None
    id: uuid.UUID | None = None


@dataclass
class MemberWeek:
    membership: TeamMembership
    plan: WeeklyPlan | None
    # Whether the viewer may open this plan (author or a possible approver).
    readable: bool


class PlanService:
    """Weekly plans and their workflow.

    `actor` is always the caller's membership of the organization in the URL.
    Every query filters by `actor.organization_id`, and plans the actor may
    not read look like they don't exist.
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    # -- Who may see and approve what ---------------------------------------

    async def can_approve(
        self, actor: OrganizationMembership, author_id: uuid.UUID
    ) -> bool:
        """D3: a lead of a team the author is in, never the author. A lead's own
        plan may also be approved by an org owner or admin."""
        if actor.user_id == author_id:
            return False
        lead, member = aliased(TeamMembership), aliased(TeamMembership)
        leads_authors_team = await self.session.scalar(
            select(
                exists().where(
                    lead.organization_id == actor.organization_id,
                    lead.user_id == actor.user_id,
                    lead.is_lead,
                    member.team_id == lead.team_id,
                    member.user_id == author_id,
                )
            )
        )
        if leads_authors_team:
            return True
        if actor.role in OrgRole.MANAGERS:
            return await self._is_lead(actor.organization_id, author_id)
        return False

    async def has_approver(self, organization_id: uuid.UUID, author_id: uuid.UUID):
        lead, member = aliased(TeamMembership), aliased(TeamMembership)
        other_lead = await self.session.scalar(
            select(
                exists().where(
                    member.organization_id == organization_id,
                    member.user_id == author_id,
                    lead.team_id == member.team_id,
                    lead.is_lead,
                    lead.user_id != author_id,
                )
            )
        )
        if other_lead:
            return True
        if not await self._is_lead(organization_id, author_id):
            return False
        other_manager = await self.session.scalar(
            select(
                exists().where(
                    OrganizationMembership.organization_id == organization_id,
                    OrganizationMembership.role.in_(OrgRole.MANAGERS),
                    OrganizationMembership.user_id != author_id,
                )
            )
        )
        return bool(other_manager)

    async def can_read(self, actor: OrganizationMembership, plan: WeeklyPlan) -> bool:
        """D6: drafts are private to the author; submitted plans are visible to
        the people who could approve them."""
        if plan.user_id == actor.user_id:
            return True
        return plan.status != PlanStatus.DRAFT and await self.can_approve(
            actor, plan.user_id
        )

    async def _is_lead(self, organization_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        return bool(
            await self.session.scalar(
                select(
                    exists().where(
                        TeamMembership.organization_id == organization_id,
                        TeamMembership.user_id == user_id,
                        TeamMembership.is_lead,
                    )
                )
            )
        )

    # -- Reading --------------------------------------------------------------

    def _plan_query(self, organization_id: uuid.UUID) -> Select[tuple[WeeklyPlan]]:
        return (
            select(WeeklyPlan)
            .options(
                selectinload(WeeklyPlan.user),
                selectinload(WeeklyPlan.tasks),
                selectinload(WeeklyPlan.reviews).selectinload(PlanReview.reviewer),
            )
            .where(WeeklyPlan.organization_id == organization_id)
        )

    async def _load(
        self, organization_id: uuid.UUID, plan_id: uuid.UUID
    ) -> WeeklyPlan | None:
        result = await self.session.execute(
            self._plan_query(organization_id)
            .where(WeeklyPlan.id == plan_id)
            .execution_options(populate_existing=True)
        )
        return result.scalars().first()

    async def reload(self, plan: WeeklyPlan) -> WeeklyPlan:
        """Re-read a plan the caller already holds, with fresh relationships."""
        reloaded = await self._load(plan.organization_id, plan.id)
        assert reloaded is not None
        return reloaded

    async def get(
        self, actor: OrganizationMembership, plan_id: uuid.UUID
    ) -> WeeklyPlan:
        plan = await self._load(actor.organization_id, plan_id)
        if plan is None or not await self.can_read(actor, plan):
            raise ResourceNotFoundException("Plan not found")
        return plan

    async def list_mine(
        self,
        actor: OrganizationMembership,
        *,
        week_start: date | None,
        limit: int,
        offset: int,
    ) -> tuple[Sequence[WeeklyPlan], int]:
        conditions = [
            WeeklyPlan.organization_id == actor.organization_id,
            WeeklyPlan.user_id == actor.user_id,
        ]
        if week_start is not None:
            conditions.append(WeeklyPlan.week_start == week_start)
        total = await self.session.scalar(
            select(func.count()).select_from(WeeklyPlan).where(*conditions)
        )
        result = await self.session.execute(
            self._plan_query(actor.organization_id)
            .where(*conditions)
            .order_by(WeeklyPlan.week_start.desc())
            .limit(limit)
            .offset(offset)
        )
        return result.scalars().all(), total or 0

    async def list_awaiting_approval(
        self, actor: OrganizationMembership
    ) -> Sequence[WeeklyPlan]:
        """Submitted plans this person can approve, oldest first."""
        lead, member = aliased(TeamMembership), aliased(TeamMembership)
        approvable = exists().where(
            lead.organization_id == actor.organization_id,
            lead.user_id == actor.user_id,
            lead.is_lead,
            member.team_id == lead.team_id,
            member.user_id == WeeklyPlan.user_id,
        )
        if actor.role in OrgRole.MANAGERS:
            author_leads = exists().where(
                TeamMembership.organization_id == actor.organization_id,
                TeamMembership.user_id == WeeklyPlan.user_id,
                TeamMembership.is_lead,
            )
            approvable = or_(approvable, author_leads)
        result = await self.session.execute(
            self._plan_query(actor.organization_id)
            .where(
                WeeklyPlan.status == PlanStatus.SUBMITTED,
                WeeklyPlan.user_id != actor.user_id,
                approvable,
            )
            .order_by(WeeklyPlan.submitted_at)
        )
        return result.scalars().all()

    # -- Writing --------------------------------------------------------------

    async def create(
        self,
        actor: OrganizationMembership,
        *,
        week_start: date,
        tasks: Sequence[TaskInput],
    ) -> WeeklyPlan:
        if week_start.weekday() != 0:
            raise ValidationException(
                "A plan's week starts on a Monday.", field="week_start"
            )
        this_monday = current_monday()
        allowed = {
            this_monday - timedelta(days=7),
            this_monday,
            this_monday + timedelta(days=7),
        }
        if week_start not in allowed:
            raise ValidationException(
                "You can plan last week, this week or next week.", field="week_start"
            )
        existing = await self.session.scalar(
            select(WeeklyPlan.id).where(
                WeeklyPlan.organization_id == actor.organization_id,
                WeeklyPlan.user_id == actor.user_id,
                WeeklyPlan.week_start == week_start,
            )
        )
        if existing is not None:
            raise ConflictException(
                "You already have a plan for that week.", field="week_start"
            )

        plan = WeeklyPlan(
            organization_id=actor.organization_id,
            user_id=actor.user_id,
            week_start=week_start,
            status=PlanStatus.DRAFT,
        )
        self.session.add(plan)
        await self.session.flush()
        plan = await self.reload(plan)
        await self._apply_tasks(plan, tasks)
        return await self.reload(plan)

    async def replace_tasks(
        self,
        actor: OrganizationMembership,
        plan: WeeklyPlan,
        tasks: Sequence[TaskInput],
    ) -> WeeklyPlan:
        self._require_author(actor, plan)
        if plan.status != PlanStatus.DRAFT:
            raise invalid_status(plan, PlanStatus.DRAFT, "edited")
        await self._apply_tasks(plan, tasks)
        return await self.reload(plan)

    async def _apply_tasks(self, plan: WeeklyPlan, tasks: Sequence[TaskInput]) -> None:
        """Make the plan's tasks match `tasks`, in order. Tasks sent with an id
        are updated in place so their ids (and AI findings about them) stay
        stable; the rest are created, and missing ones are deleted."""
        if len(tasks) > MAX_TASKS:
            raise ValidationException(
                f"A weekly plan has at most {MAX_TASKS} tasks. Keep it focused.",
                field="tasks",
            )
        if sum(1 for t in tasks if t.kind == TaskKind.MAIN) > 1:
            raise ValidationException(
                "A plan has exactly one main task.", field="tasks"
            )
        if any(t.why and t.kind != TaskKind.MAIN for t in tasks):
            raise ValidationException("Only the main task has a 'why'.", field="tasks")

        existing = {t.id: t for t in plan.tasks}
        sent_ids = {t.id for t in tasks if t.id is not None}
        if unknown := sent_ids - existing.keys():
            raise ValidationException(
                f"Task {next(iter(unknown))} is not part of this plan.", field="tasks"
            )

        # Deletes, then updates that move a task away from "main", then the
        # rest: the one-main-task index is checked row by row, so a swap of the
        # main task must clear the old one first.
        for task_id, task in existing.items():
            if task_id not in sent_ids:
                plan.tasks.remove(task)
        await self.session.flush()

        ordered = sorted(
            enumerate(tasks), key=lambda item: item[1].kind == TaskKind.MAIN
        )
        for position, data in ordered:
            if data.id is None:
                continue
            task = existing[data.id]
            task.kind = data.kind
            task.title = data.title
            task.why = data.why if data.kind == TaskKind.MAIN else None
            task.estimate_hours = data.estimate_hours
            task.position = position
            await self.session.flush()

        for position, data in enumerate(tasks):
            if data.id is not None:
                continue
            plan.tasks.append(
                PlanTask(
                    kind=data.kind,
                    title=data.title,
                    why=data.why if data.kind == TaskKind.MAIN else None,
                    estimate_hours=data.estimate_hours,
                    position=position,
                )
            )
        await self.session.flush()

    async def set_task_done(
        self,
        actor: OrganizationMembership,
        plan: WeeklyPlan,
        task_id: uuid.UUID,
        is_done: bool,
    ) -> PlanTask:
        self._require_author(actor, plan)
        if plan.status != PlanStatus.APPROVED:
            raise invalid_status(plan, PlanStatus.APPROVED, "ticked off")
        task = next((t for t in plan.tasks if t.id == task_id), None)
        if task is None:
            raise ResourceNotFoundException("Task not found")
        task.is_done = is_done
        task.done_at = datetime.now(UTC) if is_done else None
        await self.session.flush()
        return task

    async def submit(self, actor: OrganizationMembership, plan: WeeklyPlan):
        self._require_author(actor, plan)
        if plan.status != PlanStatus.DRAFT:
            raise invalid_status(plan, PlanStatus.DRAFT, "submitted")
        main = next((t for t in plan.tasks if t.kind == TaskKind.MAIN), None)
        if main is None:
            raise ValidationException(
                "Add a main task: the one significant thing to ship this week.",
                field="tasks",
            )
        if not (main.why or "").strip():
            raise ValidationException(
                "Say why the main task matters before submitting.", field="tasks"
            )
        if not await self.has_approver(actor.organization_id, plan.user_id):
            raise APIException(
                status_code=409,
                code="NO_APPROVER",
                message="Nobody can approve this plan yet. Ask an admin to add you "
                "to a team that has a lead.",
            )
        plan.status = PlanStatus.SUBMITTED
        plan.submitted_at = datetime.now(UTC)
        await self.session.flush()
        return await self.reload(plan)

    async def withdraw(self, actor: OrganizationMembership, plan: WeeklyPlan):
        self._require_author(actor, plan)
        if plan.status != PlanStatus.SUBMITTED:
            raise invalid_status(plan, PlanStatus.SUBMITTED, "withdrawn")
        plan.status = PlanStatus.DRAFT
        plan.submitted_at = None
        await self.session.flush()
        return await self.reload(plan)

    async def approve(
        self, actor: OrganizationMembership, plan: WeeklyPlan, comment: str | None
    ) -> WeeklyPlan:
        await self._require_approver(actor, plan)
        if plan.status != PlanStatus.SUBMITTED:
            raise invalid_status(plan, PlanStatus.SUBMITTED, "approved")
        now = datetime.now(UTC)
        plan.status = PlanStatus.APPROVED
        plan.approved_at = now
        plan.approved_by_id = actor.user_id
        self._record_review(plan, actor, ReviewAction.APPROVED, comment)
        await self.session.flush()
        return await self.reload(plan)

    async def request_changes(
        self, actor: OrganizationMembership, plan: WeeklyPlan, comment: str
    ) -> WeeklyPlan:
        """Send the plan back to its author as a draft, with a comment."""
        await self._require_approver(actor, plan)
        if plan.status != PlanStatus.SUBMITTED:
            raise invalid_status(plan, PlanStatus.SUBMITTED, "sent back")
        plan.status = PlanStatus.DRAFT
        plan.submitted_at = None
        self._record_review(plan, actor, ReviewAction.CHANGES_REQUESTED, comment)
        await self.session.flush()
        return await self.reload(plan)

    async def complete(
        self,
        actor: OrganizationMembership,
        plan: WeeklyPlan,
        *,
        main_goal_shipped: bool,
        outcome_note: str | None,
    ) -> WeeklyPlan:
        self._require_author(actor, plan)
        if plan.status != PlanStatus.APPROVED:
            raise invalid_status(plan, PlanStatus.APPROVED, "closed")
        plan.status = PlanStatus.DONE
        plan.completed_at = datetime.now(UTC)
        plan.main_goal_shipped = main_goal_shipped
        plan.outcome_note = outcome_note
        await self.session.flush()
        return await self.reload(plan)

    def _record_review(
        self,
        plan: WeeklyPlan,
        actor: OrganizationMembership,
        action: str,
        comment: str | None,
    ) -> None:
        plan.reviews.append(
            PlanReview(reviewer_id=actor.user_id, action=action, comment=comment)
        )

    @staticmethod
    def _require_author(actor: OrganizationMembership, plan: WeeklyPlan) -> None:
        if plan.user_id != actor.user_id:
            raise ForbiddenException(
                "Only the plan's author can do this.", code="PLAN_AUTHOR_REQUIRED"
            )

    async def _require_approver(
        self, actor: OrganizationMembership, plan: WeeklyPlan
    ) -> None:
        if plan.user_id == actor.user_id:
            raise ForbiddenException(
                "You can't approve your own plan.", code="SELF_APPROVAL"
            )
        if not await self.can_approve(actor, plan.user_id):
            raise ForbiddenException(
                "Only a lead of the author's team can review this plan.",
                code="TEAM_LEAD_REQUIRED",
            )

    # -- The team's week ------------------------------------------------------

    async def require_team_viewer(
        self, actor: OrganizationMembership, team: Team
    ) -> None:
        """Team leads see their team's week; owners and admins see every team."""
        if actor.role in OrgRole.MANAGERS:
            return
        if any(m.user_id == actor.user_id and m.is_lead for m in team.memberships):
            return
        raise ForbiddenException(
            "Only this team's lead or an organization admin can see the team's week.",
            code="TEAM_LEAD_REQUIRED",
        )

    async def team_week(
        self, actor: OrganizationMembership, team: Team, week_start: date
    ) -> list[MemberWeek]:
        await self.require_team_viewer(actor, team)
        if week_start.weekday() != 0:
            raise ValidationException(
                "A plan's week starts on a Monday.", field="week_start"
            )
        member_ids = [m.user_id for m in team.memberships]
        result = await self.session.execute(
            select(WeeklyPlan)
            .options(selectinload(WeeklyPlan.tasks))
            .where(
                WeeklyPlan.organization_id == actor.organization_id,
                WeeklyPlan.week_start == week_start,
                WeeklyPlan.user_id.in_(member_ids),
            )
        )
        plans = {p.user_id: p for p in result.scalars().all()}
        rows = []
        for membership in sorted(
            team.memberships,
            key=lambda m: (not m.is_lead, m.user.first_name, m.user.last_name),
        ):
            plan = plans.get(membership.user_id)
            readable = plan is not None and await self.can_read(actor, plan)
            rows.append(MemberWeek(membership=membership, plan=plan, readable=readable))
        return rows

    async def team_history(
        self, actor: OrganizationMembership, team: Team, *, limit: int, offset: int
    ) -> tuple[list[dict[str, Any]], int]:
        """Per-week rollup of the team's current members, newest week first."""
        await self.require_team_viewer(actor, team)
        member_ids = [m.user_id for m in team.memberships]
        conditions = [
            WeeklyPlan.organization_id == actor.organization_id,
            WeeklyPlan.user_id.in_(member_ids),
        ]
        total = await self.session.scalar(
            select(func.count(distinct(WeeklyPlan.week_start))).where(*conditions)
        )
        not_draft = WeeklyPlan.status != PlanStatus.DRAFT
        approved = WeeklyPlan.status.in_((PlanStatus.APPROVED, PlanStatus.DONE))
        result = await self.session.execute(
            select(
                WeeklyPlan.week_start,
                func.count().filter(not_draft).label("submitted"),
                func.count().filter(approved).label("approved"),
                func.count()
                .filter(WeeklyPlan.status == PlanStatus.DONE)
                .label("closed"),
                func.count()
                .filter(
                    and_(
                        WeeklyPlan.status == PlanStatus.DONE,
                        WeeklyPlan.main_goal_shipped.is_(True),
                    )
                )
                .label("shipped"),
            )
            .where(*conditions)
            .group_by(WeeklyPlan.week_start)
            .order_by(WeeklyPlan.week_start.desc())
            .limit(limit)
            .offset(offset)
        )
        weeks = [
            {"week_start": row.week_start, "member_count": len(member_ids)}
            | {
                k: getattr(row, k)
                for k in ("submitted", "approved", "closed", "shipped")
            }
            for row in result.all()
        ]
        return weeks, total or 0
