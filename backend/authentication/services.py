import re
from datetime import datetime, timedelta

import jwt
from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import connection

USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_]{3,30}$")


def _sync_users_sequence(cursor):
    """Align users.user_id sequence with current max id to prevent PK collisions."""
    cursor.execute(
        """
        SELECT setval(
            pg_get_serial_sequence('users', 'user_id'),
            COALESCE((SELECT MAX(user_id) FROM users), 1),
            true
        )
        """
    )


def validate_signup_payload(username, email, password):
    if not username or not email or not password:
        return "Username, email, and password are required."
    if not USERNAME_PATTERN.match(username):
        return "Username must be 3-30 characters and use only letters, numbers, and underscores."
    try:
        validate_email(email)
    except ValidationError:
        return "Enter a valid email address."
    return None


def validate_login_payload(username, password):
    if not username or not password:
        return "Username and password are required."
    if not USERNAME_PATTERN.match(username):
        return "Enter a valid username."
    return None


def generate_token(username, is_admin=False):
    payload = {
        "sub": username,
        "is_admin": is_admin,
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(hours=2),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def extract_username_from_auth_header(request):
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None

    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        return None

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        return None

    return payload.get("sub")


def get_authenticated_user(request):
    username = extract_username_from_auth_header(request)
    if not username:
        return None, None

    with connection.cursor() as cursor:
        cursor.execute("SELECT user_id, full_name FROM users WHERE username = %s", [username])
        row = cursor.fetchone()

    if not row:
        return None, None

    user_id, full_name = row
    return username, {"user_id": user_id, "full_name": full_name}


def create_user(
    full_name,
    username,
    email,
    password,
    employment_type=None,
    monthly_income=None,
    address=None,
    dob=None,
    phone=None,
):
    hashed_pwd = make_password(password)

    with connection.cursor() as cursor:
        _sync_users_sequence(cursor)

        cursor.execute("SELECT 1 FROM users WHERE username=%s OR email=%s", [username, email])
        if cursor.fetchone():
            return False

        cursor.execute(
            """
            INSERT INTO users (
                full_name,
                username,
                email,
                password_hash,
                employment_type,
                monthly_income,
                address,
                dob,
                phone
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            [
                full_name or username,
                username,
                email,
                hashed_pwd,
                employment_type,
                monthly_income,
                address,
                dob,
                phone,
            ],
        )

    return True


def validate_user_credentials(username, password):
    with connection.cursor() as cursor:
        cursor.execute("SELECT password_hash FROM users WHERE username = %s", [username])
        row = cursor.fetchone()

    return bool(row and check_password(password, row[0]))
