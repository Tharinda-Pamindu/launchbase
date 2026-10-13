from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import UUID4, EmailStr, Field

from app.schemas import DateTime, Model

OrgRoleName = Literal["owner", "admin", "member"]
InvitableRole = Literal["admin", "member"]
TaskKindName = Literal["main", "sub_goal", "gtm"]
PlanStatusName = Literal["draft", "submitted", "approved", "done"]


class AuthRequest(Model):
    email: EmailStr
    password: str


class SignupRequest(Model):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class AuthResponse(Model):
    access_token: str


class UserResponse(Model):
    id: UUID4
    created_at: DateTime
    updated_at: DateTime | None
    first_name: str
    last_name: str
    email: str


# -- Organizations -------------------------------------------------------------


class OrganizationCreateRequest(Model):
    name: str = Field(min_length=1, max_length=100)


class OrganizationUpdateRequest(Model):
    name: str = Field(min_length=1, max_length=100)


class OrganizationResponse(Model):
    id: UUID4
    name: str
    created_at: DateTime
    # The caller's role in this organization (a customer role, not staff).
    role: OrgRoleName
    is_suspended: bool


class MemberResponse(Model):
    id: UUID4  # membership id
    user_id: UUID4
    first_name: str
    last_name: str
    email: str
    role: OrgRoleName
    joined_at: DateTime


class MemberUpdateRequest(Model):
    role: OrgRoleName


# -- Invites -------------------------------------------------------------------


class InviteCreateRequest(Model):
    email: EmailStr
    role: InvitableRole = "member"


class InviteResponse(Model):
    id: UUID4
    email: str
    role: InvitableRole
    created_at: DateTime
    expires_at: DateTime
    invited_by: str | None


class InviteCreatedResponse(InviteResponse):
    # Shown once: only a hash of the token is stored.
    token: str
    invite_url: str


class InvitePreviewResponse(Model):
    organization_name: str
    email: str
    role: InvitableRole
    invited_by: str | None
    status: Literal["pending", "accepted", "revoked", "expired"]
    expires_at: DateTime


# -- Teams ---------------------------------------------------------------------


class TeamCreateRequest(Model):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)


class TeamUpdateRequest(Model):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)


class TeamMemberRequest(Model):
    is_lead: bool = False


class TeamMemberResponse(Model):
    user_id: UUID4
    first_name: str
    last_name: str
    is_lead: bool


class TeamResponse(Model):
    id: UUID4
    name: str
    description: str | None
    created_at: DateTime
    members: list[TeamMemberResponse]


class MemberWeekResponse(Model):
    user_id: UUID4
    first_name: str
    last_name: str
    is_lead: bool
    # "not_started" when there is no plan for the week. Drafts are private, so
    # for someone else's draft only the status is shown.
    status: Literal["not_started", "draft", "submitted", "approved", "done"]
    plan_id: UUID4 | None
    main_task_title: str | None
    tasks_done: int | None
    tasks_total: int | None
    main_goal_shipped: bool | None


class TeamWeekResponse(Model):
    team_id: UUID4
    team_name: str
    week_start: date
    members: list[MemberWeekResponse]


class TeamWeekSummaryResponse(Model):
    week_start: date
    member_count: int
    submitted: int
    approved: int
    closed: int
    shipped: int


# -- Plans ---------------------------------------------------------------------


class TaskInputRequest(Model):
    # Send the id of an existing task to keep it (and AI findings about it).
    id: UUID4 | None = None
    kind: TaskKindName
    title: str = Field(min_length=1, max_length=300)
    why: str | None = Field(default=None, max_length=1000)
    estimate_hours: int | None = Field(default=None, ge=1, le=60)


class PlanCreateRequest(Model):
    week_start: date
    tasks: list[TaskInputRequest] = Field(default_factory=list)


class PlanUpdateRequest(Model):
    tasks: list[TaskInputRequest]


class TaskUpdateRequest(Model):
    is_done: bool


class PlanApproveRequest(Model):
    comment: str | None = Field(default=None, max_length=2000)


class PlanRequestChangesRequest(Model):
    comment: str = Field(min_length=1, max_length=2000)


class PlanCompleteRequest(Model):
    main_goal_shipped: bool
    outcome_note: str | None = Field(default=None, max_length=1000)


class TaskResponse(Model):
    id: UUID4
    kind: TaskKindName
    title: str
    why: str | None
    estimate_hours: int | None
    position: int
    is_done: bool
    done_at: DateTime | None


class PlanReviewEntryResponse(Model):
    id: UUID4
    action: Literal["approved", "changes_requested"]
    comment: str | None
    reviewer_name: str | None
    created_at: DateTime


class AiFindingResponse(Model):
    # Null for a task the plan is missing; apply it by adding a new task.
    task_id: UUID4 | None
    task_ref: str
    task_kind: TaskKindName
    issue: Literal[
        "not_checkable",
        "missing_why",
        "missing_gtm",
        "scope_too_big",
        "carried_over",
        "unclear",
    ]
    severity: Literal["must_fix", "consider"]
    problem: str
    field: Literal["title", "why"]
    suggested_rewrite: str


class AiReviewResponse(Model):
    verdict: Literal["approve", "adjust"]
    summary: str
    findings: list[AiFindingResponse]
    reviewed_at: DateTime
    # The plan changed since this review was made.
    is_stale: bool


class PlanPermissions(Model):
    """What the caller can do with this plan right now, so the UI never shows
    a button the API would refuse."""

    edit: bool
    submit: bool
    withdraw: bool
    review: bool  # approve or send back
    tick_tasks: bool
    complete: bool
    ai_review: bool


class PlanResponse(Model):
    id: UUID4
    week_start: date
    status: PlanStatusName
    author_id: UUID4
    author_name: str
    created_at: DateTime
    submitted_at: DateTime | None
    approved_at: DateTime | None
    completed_at: DateTime | None
    main_goal_shipped: bool | None
    outcome_note: str | None
    tasks: list[TaskResponse]
    reviews: list[PlanReviewEntryResponse]
    # The author's own AI review; never shown to anyone else.
    ai_review: AiReviewResponse | None
    total_estimate_hours: int
    permissions: PlanPermissions


# -- AI ------------------------------------------------------------------------


class PlanDraftRequest(Model):
    notes: str = Field(min_length=10, max_length=4000)


class DraftTaskResponse(Model):
    title: str
    estimate_hours: int | None


class DraftMainTaskResponse(DraftTaskResponse):
    why: str


class PlanDraftResponse(Model):
    """Pre-fills the plan form. Nothing is saved until the member saves it."""

    main_task: DraftMainTaskResponse
    sub_goals: list[DraftTaskResponse]
    gtm_goals: list[DraftTaskResponse]
    left_out: list[str]


class AiStatusResponse(Model):
    available: bool
