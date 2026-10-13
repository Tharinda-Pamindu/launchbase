import uuid
from collections.abc import Sequence
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.exceptions import ConflictException, ResourceNotFoundException
from app.models import OrganizationMembership, Team, TeamMembership


class TeamService:
    """Teams inside one organization. Every lookup is scoped by org id, so a
    team id from another organization is simply not found."""

    def __init__(self, session: AsyncSession):
        self.session = session

    def _query(self, organization_id: uuid.UUID):
        return (
            select(Team)
            .options(selectinload(Team.memberships).selectinload(TeamMembership.user))
            .where(Team.organization_id == organization_id)
        )

    async def list(self, organization_id: uuid.UUID) -> Sequence[Team]:
        result = await self.session.execute(
            self._query(organization_id).order_by(Team.name)
        )
        return result.scalars().all()

    async def get(self, organization_id: uuid.UUID, team_id: uuid.UUID) -> Team:
        result = await self.session.execute(
            self._query(organization_id).where(Team.id == team_id)
        )
        team = result.scalars().first()
        if team is None:
            raise ResourceNotFoundException("Team not found")
        return team

    async def create(
        self, organization_id: uuid.UUID, *, name: str, description: str | None
    ) -> Team:
        await self._ensure_name_available(organization_id, name)
        team = Team(organization_id=organization_id, name=name, description=description)
        self.session.add(team)
        await self.session.flush()
        return await self.get(organization_id, team.id)

    async def update(self, team: Team, changes: dict[str, Any]) -> Team:
        name = changes.get("name")
        if name is not None and name != team.name:
            await self._ensure_name_available(
                team.organization_id, name, exclude_id=team.id
            )
        for field, value in changes.items():
            if field == "name" and value is None:
                continue
            setattr(team, field, value)
        await self.session.flush()
        return team

    async def delete(self, team: Team) -> None:
        await self.session.delete(team)
        await self.session.flush()

    async def set_member(
        self, team: Team, *, user_id: uuid.UUID, is_lead: bool
    ) -> Team:
        """Add someone to the team, or change whether they lead it. Making
        someone lead replaces the previous lead."""
        is_org_member = await self.session.scalar(
            select(OrganizationMembership.id).where(
                OrganizationMembership.organization_id == team.organization_id,
                OrganizationMembership.user_id == user_id,
            )
        )
        if is_org_member is None:
            raise ResourceNotFoundException("Member not found")

        if is_lead:
            await self.session.execute(
                update(TeamMembership)
                .where(
                    TeamMembership.team_id == team.id,
                    TeamMembership.user_id != user_id,
                    TeamMembership.is_lead,
                )
                .values(is_lead=False)
            )
            # The partial unique index is checked per statement; make sure the
            # old lead is cleared before the new one is written.
            await self.session.flush()

        membership = await self.session.scalar(
            select(TeamMembership).where(
                TeamMembership.team_id == team.id, TeamMembership.user_id == user_id
            )
        )
        if membership is None:
            self.session.add(
                TeamMembership(
                    organization_id=team.organization_id,
                    team_id=team.id,
                    user_id=user_id,
                    is_lead=is_lead,
                )
            )
        else:
            membership.is_lead = is_lead
        await self.session.flush()
        return await self._reload(team)

    async def remove_member(self, team: Team, user_id: uuid.UUID) -> None:
        membership = await self.session.scalar(
            select(TeamMembership).where(
                TeamMembership.team_id == team.id, TeamMembership.user_id == user_id
            )
        )
        if membership is None:
            raise ResourceNotFoundException("Team member not found")
        await self.session.delete(membership)
        await self.session.flush()

    async def _reload(self, team: Team) -> Team:
        # The memberships collection was loaded before the change; refresh it.
        result = await self.session.execute(
            self._query(team.organization_id)
            .where(Team.id == team.id)
            .execution_options(populate_existing=True)
        )
        return result.scalars().one()

    async def _ensure_name_available(
        self,
        organization_id: uuid.UUID,
        name: str,
        *,
        exclude_id: uuid.UUID | None = None,
    ) -> None:
        stmt = select(Team.id).where(
            Team.organization_id == organization_id, Team.name == name
        )
        if exclude_id is not None:
            stmt = stmt.where(Team.id != exclude_id)
        if await self.session.scalar(stmt) is not None:
            raise ConflictException(
                f"A team called '{name}' already exists.", field="name"
            )
