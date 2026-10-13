import pytest
from faker import Faker
from sqlalchemy import select

from app.models import User
from app.security import hash_password

fake = Faker()


@pytest.mark.asyncio
async def test_health_endpoint_healthy(async_client):
    """Test health endpoint returns healthy status when database is accessible."""
    response = await async_client.get("/app/health")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"


@pytest.mark.asyncio
async def test_auth_success(async_client, session_factory):
    """Test successful authentication with valid credentials."""
    email = fake.email().lower()
    password = "testpassword123"

    # Create User directly for authentication testing
    async with session_factory() as db:
        user = User(
            first_name=fake.first_name(),
            last_name=fake.last_name(),
            email=email,
            password=hash_password(password),
            is_active=True,
        )
        db.add(user)
        await db.commit()

    # Test authentication
    auth_data = {"email": email, "password": password}
    response = await async_client.post("/app/auth", json=auth_data)

    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data


@pytest.mark.asyncio
async def test_auth_invalid_email(async_client):
    """Test authentication fails with non-existent email."""
    auth_data = {"email": "nonexistent@example.com", "password": "anypassword"}

    response = await async_client.post("/app/auth", json=auth_data)

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_auth_invalid_password(async_client, session_factory):
    """Test authentication fails with wrong password."""
    # Create a test user
    email = fake.email().lower()
    password = "correctpassword"

    async with session_factory() as db:
        user = User(
            first_name=fake.first_name(),
            last_name=fake.last_name(),
            email=email,
            password=hash_password(password),
            is_active=True,
        )
        db.add(user)
        await db.commit()

    # Test with wrong password
    auth_data = {"email": email, "password": "wrongpassword"}

    response = await async_client.post("/app/auth", json=auth_data)

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_auth_missing_fields(async_client):
    """Test authentication fails with missing required fields."""
    auth_data = {
        "email": fake.email()
        # Missing password
    }

    response = await async_client.post("/app/auth", json=auth_data)

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_auth_invalid_email_format(async_client):
    """Test authentication fails with invalid email format."""
    auth_data = {"email": "invalid-email", "password": "somepassword"}

    response = await async_client.post("/app/auth", json=auth_data)

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_logout_success(async_client):
    """Test successful logout."""
    response = await async_client.post("/app/logout")

    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "Successfully logged out"


@pytest.mark.asyncio
async def test_auth_inactive_user(async_client, session_factory):
    """A deactivated user cannot log in, and gets the generic error."""
    email = fake.email().lower()
    password = "testpassword123"

    async with session_factory() as db:
        db.add(
            User(
                first_name=fake.first_name(),
                last_name=fake.last_name(),
                email=email,
                password=hash_password(password),
                is_active=False,
            )
        )
        await db.commit()

    response = await async_client.post(
        "/app/auth", json={"email": email, "password": password}
    )

    assert response.status_code == 401
    assert response.json()["detail"][0]["type"] == "invalid_credentials"


def _signup_data(**overrides):
    return {
        "first_name": fake.first_name(),
        "last_name": fake.last_name(),
        "email": fake.email(),
        "password": "testpassword123",
        **overrides,
    }


@pytest.mark.asyncio
async def test_signup_success(async_client, session_factory):
    """Sign-up creates an active customer account and starts a session."""
    data = _signup_data(email="New.Person@Example.com")

    response = await async_client.post("/app/signup", json=data)

    assert response.status_code == 201
    assert "access_token" in response.json()
    assert "access_token" in response.cookies

    me = await async_client.get("/app/users/self")
    assert me.status_code == 200
    assert me.json()["email"] == "new.person@example.com"

    async with session_factory() as db:
        user = (
            await db.execute(select(User).where(User.email == "new.person@example.com"))
        ).scalar_one()
        assert user.is_active is True
        assert user.is_admin is False
        assert user.password != data["password"]

    login = await async_client.post(
        "/app/auth",
        json={"email": "new.person@example.com", "password": data["password"]},
    )
    assert login.status_code == 200


@pytest.mark.asyncio
async def test_signup_cannot_grant_platform_staff(async_client, session_factory):
    """Extra fields like is_admin are ignored; sign-up never creates staff."""
    data = _signup_data(is_admin=True, is_active=False)

    response = await async_client.post("/app/signup", json=data)

    assert response.status_code == 201
    async with session_factory() as db:
        user = (
            await db.execute(select(User).where(User.email == data["email"].lower()))
        ).scalar_one()
        assert user.is_admin is False
        assert user.is_active is True


@pytest.mark.asyncio
async def test_signup_duplicate_email(async_client):
    """A second sign-up with the same email, in any case, is a 409."""
    data = _signup_data()
    first = await async_client.post("/app/signup", json=data)
    assert first.status_code == 201

    async_client.cookies.clear()
    response = await async_client.post(
        "/app/signup", json=_signup_data(email=data["email"].upper())
    )

    assert response.status_code == 409
    assert response.json()["detail"][0]["loc"] == ["body", "email"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "overrides",
    [
        {"password": "short"},
        {"email": "not-an-email"},
        {"first_name": ""},
        {"last_name": "x" * 101},
    ],
)
async def test_signup_validation(async_client, overrides):
    """Invalid sign-up input is rejected before anything is created."""
    response = await async_client.post("/app/signup", json=_signup_data(**overrides))

    assert response.status_code == 422
    assert "access_token" not in response.cookies
