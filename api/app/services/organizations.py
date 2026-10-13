import hashlib
import secrets
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.exceptions import (
    APIException,
    ConflictException,
    ForbiddenException,
    ResourceNotFoundException,
)
from app.models import (
    Organization,
    OrganizationInvite,
    OrganizationMembership,
    OrgRole,
    User,
)

LAST_OWNER_MESSAGE = (
    "An organization needs at least one owner. Make someone else an owner first."
)

INVITE_UNUSABLE_MESSAGES = {
    "accepted": "This invite link has already been used.",
    "revoked": "This invite link was cancelled. Ask for a new one.",
    "expired": "This invite link has expired. Ask for a new one.",
}


def hash_invite_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def invite_status(invite: OrganizationInvite, now: datetime | None = None) -> str:
    now = now or datetime.now(UTC)
    if invite.accepted_at is not None:
        return "accepted"
    if invite.revoked_at is not None:
        return "revoked"
    if invite.expires_at <= now:
        return "expired"
    return "pending"


class OrganizationService:
    """Organizations and who belongs to them.

    Callers pass an already-resolved `OrgContext` (or org id) for anything
    tenant-scoped, and every query here filters by that organization id.
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_for_user(
        self, user_id: uuid.UUID
    ) -> Sequence[tuple[OrganizationMembership, Organization]]:
        result = await self.session.execute(
            select(OrganizationMembership, Organization)
            .join(Organization)
            .where(OrganizationMembership.user_id == user_id)
            .order_by(Organization.name)
        )
        return [(m, o) for m, o in result.tuples().all()]

    async def create(self, *, owner: User, name: str) -> OrganizationMembership:
        organization = Organization(name=name)
        self.session.add(organization)
        await self.session.flush()
        membership = OrganizationMembership(
            organization_id=organization.id, user_id=owner.id, role=OrgRole.OWNER
        )
        membership.organization = organization
        self.session.add(membership)
        await self.session.flush()
        return membership

    async def rename(self, organization: Organization, name: str) -> Organization:
        organization.name = name
        await self.session.flush()
        return organization

    async def list_members(
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

    async def get_member(
        self, organization_id: uuid.UUID, membership_id: uuid.UUID
    ) -> OrganizationMembership:
        result = await self.session.execute(
            select(OrganizationMembership)
            .options(selectinload(OrganizationMembership.user))
            .where(
                OrganizationMembership.organization_id == organization_id,
                OrganizationMembership.id == membership_id,
            )
        )
        membership = result.scalars().first()
        if membership is None:
            raise ResourceNotFoundException("Member not found")
        return membership

    async def change_role(
        self, actor: OrganizationMembership, target: OrganizationMembership, role: str
    ) -> OrganizationMembership:
        """Owners may set any role; org admins only move people between admin
        and member. The last owner can't be demoted."""
        self._require_manager(actor)
        if actor.role != OrgRole.OWNER and OrgRole.OWNER in (target.role, role):
            raise ForbiddenException(
                "Only an owner can grant or change the owner role.",
                code="ORG_OWNER_REQUIRED",
            )
        if target.role == OrgRole.OWNER and role != OrgRole.OWNER:
            await self._ensure_not_last_owner(target.organization_id)
        target.role = role
        await self.session.flush()
        return target

    async def remove_member(
        self, actor: OrganizationMembership, target: OrganizationMembership
    ) -> None:
        self._require_manager(actor)
        if actor.role != OrgRole.OWNER and target.role != OrgRole.MEMBER:
            raise ForbiddenException(
                "Org admins can only remove members. Ask an owner.",
                code="ORG_OWNER_REQUIRED",
            )
        await self._delete_membership(target)

    async def leave(self, membership: OrganizationMembership) -> None:
        await self._delete_membership(membership)

    async def _delete_membership(self, membership: OrganizationMembership) -> None:
        if membership.role == OrgRole.OWNER:
            await self._ensure_not_last_owner(membership.organization_id)
        # Team memberships go with it through the composite foreign key.
        await self.session.delete(membership)
        await self.session.flush()

    async def _ensure_not_last_owner(self, organization_id: uuid.UUID) -> None:
        owners = await self.session.scalar(
            select(func.count()).where(
                OrganizationMembership.organization_id == organization_id,
                OrganizationMembership.role == OrgRole.OWNER,
            )
        )
        if (owners or 0) <= 1:
            raise ConflictException(LAST_OWNER_MESSAGE)

    @staticmethod
    def _require_manager(actor: OrganizationMembership) -> None:
        if actor.role not in OrgRole.MANAGERS:
            raise ForbiddenException(
                "Only organization owners and admins can do this.",
                code="ORG_ADMIN_REQUIRED",
            )


class InviteService:
    """Invite links. Only a hash of each token is stored, so a link can't be
    recovered from the database; the creator copies it once."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(
        self,
        *,
        organization_id: uuid.UUID,
        created_by: User,
        email: str,
        role: str,
    ) -> tuple[OrganizationInvite, str]:
        email = email.lower()
        already_member = await self.session.scalar(
            select(OrganizationMembership.id)
            .join(User)
            .where(
                OrganizationMembership.organization_id == organization_id,
                User.email == email,
            )
        )
        if already_member is not None:
            raise ConflictException(
                f"{email} is already a member of this organization.", field="email"
            )

        now = datetime.now(UTC)
        # A new link replaces any earlier pending one for the same person.
        for previous in await self._pending_for_email(organization_id, email, now):
            previous.revoked_at = now

        token = secrets.token_urlsafe(32)
        invite = OrganizationInvite(
            organization_id=organization_id,
            email=email,
            role=role,
            token_hash=hash_invite_token(token),
            created_by_id=created_by.id,
            expires_at=now + timedelta(days=settings.INVITE_EXPIRE_DAYS),
        )
        invite.created_by = created_by
        self.session.add(invite)
        await self.session.flush()
        return invite, token

    async def list_pending(
        self, organization_id: uuid.UUID
    ) -> Sequence[OrganizationInvite]:
        result = await self.session.execute(
            select(OrganizationInvite)
            .options(selectinload(OrganizationInvite.created_by))
            .where(
                OrganizationInvite.organization_id == organization_id,
                OrganizationInvite.accepted_at.is_(None),
                OrganizationInvite.revoked_at.is_(None),
                OrganizationInvite.expires_at > datetime.now(UTC),
            )
            .order_by(OrganizationInvite.created_at.desc())
        )
        return result.scalars().all()

    async def revoke(self, organization_id: uuid.UUID, invite_id: uuid.UUID) -> None:
        invite = await self.session.scalar(
            select(OrganizationInvite).where(
                OrganizationInvite.organization_id == organization_id,
                OrganizationInvite.id == invite_id,
            )
        )
        if invite is None:
            raise ResourceNotFoundException("Invite not found")
        if invite.accepted_at is None and invite.revoked_at is None:
            invite.revoked_at = datetime.now(UTC)
            await self.session.flush()

    async def get_by_token(self, token: str) -> OrganizationInvite:
        result = await self.session.execute(
            select(OrganizationInvite)
            .options(
                selectinload(OrganizationInvite.organization),
                selectinload(OrganizationInvite.created_by),
            )
            .where(OrganizationInvite.token_hash == hash_invite_token(token))
        )
        invite = result.scalars().first()
        if invite is None:
            raise ResourceNotFoundException("Invite not found")
        return invite

    async def accept(self, *, token: str, user: User) -> OrganizationMembership:
        invite = await self.get_by_token(token)
        status = invite_status(invite)
        if status != "pending":
            raise APIException(
                status_code=410,
                code=f"INVITE_{status.upper()}",
                message=INVITE_UNUSABLE_MESSAGES[status],
            )
        if invite.email != user.email.lower():
            raise ForbiddenException(
                f"This invite is for {invite.email}. Sign in with that email to "
                "accept it.",
                code="INVITE_EMAIL_MISMATCH",
            )
        if invite.organization.suspended_at is not None:
            raise ForbiddenException(
                "This organization is suspended.", code="ORGANIZATION_SUSPENDED"
            )
        existing = await self.session.scalar(
            select(OrganizationMembership).where(
                OrganizationMembership.organization_id == invite.organization_id,
                OrganizationMembership.user_id == user.id,
            )
        )
        if existing is not None:
            raise ConflictException("You are already a member of this organization.")

        membership = OrganizationMembership(
            organization_id=invite.organization_id, user_id=user.id, role=invite.role
        )
        membership.organization = invite.organization
        self.session.add(membership)
        invite.accepted_at = datetime.now(UTC)
        invite.accepted_by_id = user.id
        await self.session.flush()
        return membership

    async def _pending_for_email(
        self, organization_id: uuid.UUID, email: str, now: datetime
    ) -> Sequence[OrganizationInvite]:
        result = await self.session.execute(
            select(OrganizationInvite).where(
                OrganizationInvite.organization_id == organization_id,
                OrganizationInvite.email == email,
                OrganizationInvite.accepted_at.is_(None),
                OrganizationInvite.revoked_at.is_(None),
                OrganizationInvite.expires_at > now,
            )
        )
        return result.scalars().all()
