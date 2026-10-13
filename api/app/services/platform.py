"""What platform staff see on the internal surface.

Deliberately metadata only: counts, statuses, timestamps, names, emails and
roles. Nothing here reads task titles, "why"s, review comments or AI output;
staff don't need the content of customers' plans to run the product.
"""

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.exceptions import ConflictException, ResourceNotFoundException
from app.models import (
    AiOutcome,
    AiUsageEvent,
    Organization,
    OrganizationMembership,
    Team,
    TeamMembership,
    User,
    WeeklyPlan,
)


def _count(model: Any, organization_id_column: Any):
    return (
        select(func.count())
        .select_from(model)
        .where(organization_id_column == Organization.id)
        .correlate(Organization)
        .scalar_subquery()
    )


class PlatformService:
    def __init__(self, session: AsyncSession):
        self.session = session

    # -- Organizations --------------------------------------------------------

    def _organizations_query(self) -> Select:
        last_plan_activity = (
            select(
                func.max(func.coalesce(WeeklyPlan.updated_at, WeeklyPlan.created_at))
            )
            .where(WeeklyPlan.organization_id == Organization.id)
            .correlate(Organization)
            .scalar_subquery()
        )
        last_ai_call = (
            select(func.max(AiUsageEvent.created_at))
            .where(AiUsageEvent.organization_id == Organization.id)
            .correlate(Organization)
            .scalar_subquery()
        )
        return select(
            Organization,
            _count(
                OrganizationMembership, OrganizationMembership.organization_id
            ).label("member_count"),
            _count(Team, Team.organization_id).label("team_count"),
            _count(WeeklyPlan, WeeklyPlan.organization_id).label("plan_count"),
            # GREATEST skips NULLs, so an org with no activity falls back to
            # when it was created.
            func.greatest(
                last_plan_activity, last_ai_call, Organization.created_at
            ).label("last_active_at"),
        )

    async def list_organizations(
        self,
        *,
        q: str | None,
        status: Literal["active", "suspended"] | None,
        limit: int,
        offset: int,
    ) -> tuple[Sequence[Any], int]:
        conditions = []
        if q:
            conditions.append(Organization.name.ilike(f"%{q}%"))
        if status == "active":
            conditions.append(Organization.suspended_at.is_(None))
        elif status == "suspended":
            conditions.append(Organization.suspended_at.is_not(None))
        total = await self.session.scalar(
            select(func.count()).select_from(Organization).where(*conditions)
        )
        result = await self.session.execute(
            self._organizations_query()
            .where(*conditions)
            .order_by(Organization.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return result.all(), total or 0

    async def get_organization(self, organization_id: uuid.UUID) -> Any:
        row = (
            await self.session.execute(
                self._organizations_query().where(Organization.id == organization_id)
            )
        ).first()
        if row is None:
            raise ResourceNotFoundException("Organization not found")
        return row

    async def organization_members(
        self, organization_id: uuid.UUID
    ) -> Sequence[OrganizationMembership]:
        result = await self.session.execute(
            select(OrganizationMembership)
            .join(User)
            .options(selectinload(OrganizationMembership.user))
            .where(OrganizationMembership.organization_id == organization_id)
            .order_by(User.first_name, User.last_name)
        )
        return result.scalars().all()

    async def organization_teams(self, organization_id: uuid.UUID) -> Sequence[Team]:
        result = await self.session.execute(
            select(Team)
            .options(selectinload(Team.memberships).selectinload(TeamMembership.user))
            .where(Team.organization_id == organization_id)
            .order_by(Team.name)
        )
        return result.scalars().all()

    async def suspend(self, organization_id: uuid.UUID, reason: str) -> None:
        organization = await self._get(organization_id)
        if organization.suspended_at is not None:
            raise ConflictException("This organization is already suspended.")
        organization.suspended_at = datetime.now(UTC)
        organization.suspended_reason = reason
        await self.session.flush()

    async def reinstate(self, organization_id: uuid.UUID) -> None:
        organization = await self._get(organization_id)
        if organization.suspended_at is None:
            raise ConflictException("This organization isn't suspended.")
        organization.suspended_at = None
        organization.suspended_reason = None
        await self.session.flush()

    async def _get(self, organization_id: uuid.UUID) -> Organization:
        organization = await self.session.get(Organization, organization_id)
        if organization is None:
            raise ResourceNotFoundException("Organization not found")
        return organization

    # -- Users ----------------------------------------------------------------

    async def user_memberships(
        self, user_id: uuid.UUID
    ) -> Sequence[OrganizationMembership]:
        result = await self.session.execute(
            select(OrganizationMembership)
            .join(Organization)
            .options(selectinload(OrganizationMembership.organization))
            .where(OrganizationMembership.user_id == user_id)
            .order_by(Organization.name)
        )
        return result.scalars().all()

    # -- AI usage -------------------------------------------------------------

    async def ai_usage_by_organization(self, *, days: int) -> Sequence[Any]:
        since = datetime.now(UTC) - timedelta(days=days)
        outcome = AiUsageEvent.outcome
        result = await self.session.execute(
            select(
                Organization.id.label("organization_id"),
                Organization.name.label("organization_name"),
                func.count().label("calls"),
                func.count().filter(outcome == AiOutcome.SUCCEEDED).label("succeeded"),
                func.count().filter(outcome == AiOutcome.FAILED).label("failed"),
                func.count()
                .filter(outcome == AiOutcome.RATE_LIMITED)
                .label("rate_limited"),
                func.coalesce(func.sum(AiUsageEvent.input_tokens), 0).label(
                    "input_tokens"
                ),
                func.coalesce(func.sum(AiUsageEvent.output_tokens), 0).label(
                    "output_tokens"
                ),
                func.max(AiUsageEvent.created_at).label("last_call_at"),
            )
            .join(Organization, Organization.id == AiUsageEvent.organization_id)
            .where(AiUsageEvent.created_at >= since)
            .group_by(Organization.id, Organization.name)
            .order_by(func.count().desc())
        )
        return result.all()

    async def ai_usage_events(
        self,
        *,
        organization_id: uuid.UUID | None,
        outcome: str | None,
        limit: int,
        offset: int,
    ) -> tuple[Sequence[Any], int]:
        conditions = []
        if organization_id is not None:
            conditions.append(AiUsageEvent.organization_id == organization_id)
        if outcome is not None:
            conditions.append(AiUsageEvent.outcome == outcome)
        total = await self.session.scalar(
            select(func.count()).select_from(AiUsageEvent).where(*conditions)
        )
        result = await self.session.execute(
            select(AiUsageEvent, Organization.name)
            .join(Organization, Organization.id == AiUsageEvent.organization_id)
            .where(*conditions)
            .order_by(AiUsageEvent.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return result.all(), total or 0
