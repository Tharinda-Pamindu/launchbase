import pytest
from faker import Faker

from app.models import User
from app.security import JWT_AUDIENCE_INTERNAL, generate_jwt_token, hash_password

fake = Faker()


async def _create_staff(session_factory, *, is_active: bool) -> tuple[User, str]:
    password = "staffpassword123"
    async with session_factory() as db:
        user = User(
            first_name=fake.first_name(),
            last_name=fake.last_name(),
            email=fake.email().lower(),
            password=hash_password(password),
            is_admin=True,
            is_active=is_active,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    return user, password


@pytest.mark.asyncio
async def test_internal_auth_active_staff(async_client, session_factory):
    user, password = await _create_staff(session_factory, is_active=True)

    response = await async_client.post(
        "/internal/auth", json={"email": user.email, "password": password}
    )

    assert response.status_code == 200
    me = await async_client.get("/internal/users/self")
    assert me.status_code == 200


@pytest.mark.asyncio
async def test_internal_auth_inactive_staff(async_client, session_factory):
    """Deactivated staff cannot log in to the internal surface."""
    user, password = await _create_staff(session_factory, is_active=False)

    response = await async_client.post(
        "/internal/auth", json={"email": user.email, "password": password}
    )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_internal_token_of_inactive_staff(async_client, session_factory):
    """A deactivated staff member's existing internal token stops working."""
    user, _ = await _create_staff(session_factory, is_active=False)
    token = generate_jwt_token({"sub": str(user.id)}, audience=JWT_AUDIENCE_INTERNAL)

    async_client.cookies.set("internal_access_token", f"Bearer {token}")
    response = await async_client.get("/internal/users/self")

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_internal_auth_customer_refused(async_client):
    """A signed-up customer cannot log in to the internal surface."""
    data = {
        "first_name": fake.first_name(),
        "last_name": fake.last_name(),
        "email": fake.email(),
        "password": "testpassword123",
    }
    assert (await async_client.post("/app/signup", json=data)).status_code == 201

    response = await async_client.post(
        "/internal/auth", json={"email": data["email"], "password": data["password"]}
    )

    assert response.status_code == 401


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("origin", "allowed"),
    [("http://localhost:3002", True), ("http://localhost:3001", False)],
)
async def test_internal_cors_only_allows_staff_console(async_client, origin, allowed):
    """The customer app's origin gets no CORS grant on the internal surface."""
    response = await async_client.options(
        "/internal/auth",
        headers={"Origin": origin, "Access-Control-Request-Method": "POST"},
    )

    assert (response.headers.get("access-control-allow-origin") == origin) is allowed
