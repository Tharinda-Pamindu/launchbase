import uuid

from fastapi import APIRouter, Query, status

from app.api.internal.access import CurrentInternalUser
from app.api.internal.schemas import (
    InternalUserDetailResponse,
    InternalUserResponse,
    UserChangePasswordRequest,
    UserCreateRequest,
    UserMembershipResponse,
    UsersListResponse,
    UserUpdateRequest,
)
from app.database import DBSession
from app.exceptions import ConflictException
from app.services.platform import PlatformService
from app.services.users import UserService

router = APIRouter()


@router.get("/users/self", tags=["users"])
async def get_current_internal_user(
    current_user: CurrentInternalUser,
) -> InternalUserResponse:
    return InternalUserResponse.model_validate(current_user)


@router.get("/users", tags=["users"])
async def user_list(
    current_user: CurrentInternalUser,
    session: DBSession,
    q: str | None = Query(None, max_length=100, description="Name or email"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> UsersListResponse:
    users, total = await UserService(session).list_users(
        q=q, limit=limit, offset=offset
    )
    return UsersListResponse(
        items=[InternalUserResponse.model_validate(u) for u in users],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("/users", status_code=status.HTTP_201_CREATED, tags=["users"])
async def user_create(
    current_user: CurrentInternalUser,
    session: DBSession,
    data: UserCreateRequest,
) -> InternalUserResponse:
    """Create a customer account. Staff are only created from the CLI."""
    user = await UserService(session).create_user(**data.model_dump())
    await session.commit()
    return InternalUserResponse.model_validate(user)


@router.get("/users/{user_id}", tags=["users"])
async def user_get(
    current_user: CurrentInternalUser, session: DBSession, user_id: uuid.UUID
) -> InternalUserDetailResponse:
    """A user and the organizations they belong to."""
    user = await UserService(session).get_user(user_id)
    memberships = await PlatformService(session).user_memberships(user_id)
    return InternalUserDetailResponse(
        **InternalUserResponse.model_validate(user).model_dump(),
        memberships=[
            UserMembershipResponse(
                organization_id=m.organization_id,
                organization_name=m.organization.name,
                role=m.role,  # pyright: ignore[reportArgumentType]
                organization_suspended=m.organization.suspended_at is not None,
                joined_at=m.created_at,
            )
            for m in memberships
        ],
    )


@router.patch("/users/{user_id}", tags=["users"])
async def user_update(
    current_user: CurrentInternalUser,
    session: DBSession,
    user_id: uuid.UUID,
    data: UserUpdateRequest,
) -> InternalUserResponse:
    """Edit a user, or deactivate them with `is_active: false`. Deactivation
    ends their sessions at once; accounts are never hard-deleted."""
    if user_id == current_user.id and data.is_active is False:
        raise ConflictException("You can't deactivate your own account.")
    user = await UserService(session).update_user(
        user_id, data.model_dump(exclude_unset=True)
    )
    await session.commit()
    return InternalUserResponse.model_validate(user)


@router.post(
    "/users/{user_id}/change-password",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["users"],
)
async def user_change_password(
    current_user: CurrentInternalUser,
    session: DBSession,
    user_id: uuid.UUID,
    data: UserChangePasswordRequest,
) -> None:
    await UserService(session).change_password(user_id, data.password)
    await session.commit()
