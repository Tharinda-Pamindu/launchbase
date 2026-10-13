from __future__ import annotations

from typing import Literal

from pydantic import UUID4, EmailStr, Field

from app.schemas import DateTime, Model


class AuthRequest(Model):
    email: EmailStr
    password: str


class AuthResponse(Model):
    access_token: str


class InternalUserResponse(Model):
    id: UUID4
    created_at: DateTime
    updated_at: DateTime | None
    first_name: str
    last_name: str
    email: str
    is_admin: bool
    is_active: bool


class UsersListResponse(Model):
    items: list[InternalUserResponse]
    total: int
    limit: int
    offset: int


class UserCreateRequest(Model):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8)
    is_active: bool = True


class UserUpdateRequest(Model):
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, min_length=1, max_length=100)
    email: EmailStr | None = None
    is_active: bool | None = None


class UserChangePasswordRequest(Model):
    password: str = Field(min_length=8)


# Staff accounts (is_admin) are never granted from here: only with
# `manage.py create-user --admin`. The create and update requests above
# deliberately have no is_admin field.


class UserMembershipResponse(Model):
    organization_id: UUID4
    organization_name: str
    # The user's customer role in that organization, not platform staff.
    role: Literal["owner", "admin", "member"]
    organization_suspended: bool
    joined_at: DateTime


class InternalUserDetailResponse(InternalUserResponse):
    memberships: list[UserMembershipResponse]


# -- Organizations (metadata only; staff never see plan content) -------------


class OrganizationSummaryResponse(Model):
    id: UUID4
    name: str
    created_at: DateTime
    suspended_at: DateTime | None
    suspended_reason: str | None
    member_count: int
    team_count: int
    plan_count: int
    last_active_at: DateTime


class OrganizationsListResponse(Model):
    items: list[OrganizationSummaryResponse]
    total: int
    limit: int
    offset: int


class OrganizationMemberResponse(Model):
    user_id: UUID4
    first_name: str
    last_name: str
    email: str
    role: Literal["owner", "admin", "member"]
    is_active: bool
    joined_at: DateTime


class OrganizationTeamResponse(Model):
    id: UUID4
    name: str
    member_count: int
    lead_name: str | None


class OrganizationDetailResponse(OrganizationSummaryResponse):
    members: list[OrganizationMemberResponse]
    teams: list[OrganizationTeamResponse]


class OrganizationSuspendRequest(Model):
    reason: str = Field(min_length=1, max_length=500)


# -- AI usage -------------------------------------------------------------------


class AiUsageOrganizationResponse(Model):
    organization_id: UUID4
    organization_name: str
    calls: int
    succeeded: int
    failed: int
    rate_limited: int
    input_tokens: int
    output_tokens: int
    last_call_at: DateTime


class AiUsageSummaryResponse(Model):
    days: int
    calls: int
    succeeded: int
    failed: int
    rate_limited: int
    input_tokens: int
    output_tokens: int
    organizations: list[AiUsageOrganizationResponse]


class AiUsageEventResponse(Model):
    id: UUID4
    created_at: DateTime
    organization_id: UUID4
    organization_name: str
    user_id: UUID4 | None
    operation: Literal["plan_review", "plan_draft"]
    outcome: Literal["succeeded", "failed", "rate_limited"]
    error_kind: str | None
    model: str
    latency_ms: int
    input_tokens: int | None
    output_tokens: int | None


class AiUsageEventsListResponse(Model):
    items: list[AiUsageEventResponse]
    total: int
    limit: int
    offset: int
