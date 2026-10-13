from __future__ import annotations

from pydantic import UUID4, EmailStr, Field

from app.schemas import DateTime, Model


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
