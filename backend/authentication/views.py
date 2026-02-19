from django.conf import settings

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .services import (
    create_user,
    generate_token,
    validate_login_payload,
    validate_signup_payload,
    validate_user_credentials,
)


@api_view(["POST"])
@permission_classes([AllowAny])
def signup(request):
    full_name = request.data.get("full_name")
    username = request.data.get("username")
    email = request.data.get("email")
    password = request.data.get("password")

    validation_error = validate_signup_payload(username, email, password)
    if validation_error:
        return Response({"error": validation_error}, status=status.HTTP_400_BAD_REQUEST)

    address = request.data.get("address")
    dob = request.data.get("dob")
    phone = request.data.get("phone")

    user_created = create_user(
        full_name,
        username,
        email,
        password,
        address=address,
        dob=dob or None,
        phone=phone,
    )
    if not user_created:
        return Response({"error": "Username or email already exists."}, status=status.HTTP_400_BAD_REQUEST)

    return Response({"message": "User created successfully!"}, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([AllowAny])
def login(request):
    username = request.data.get("username")
    password = request.data.get("password")

    validation_error = validate_login_payload(username, password)
    if validation_error:
        return Response({"error": validation_error}, status=status.HTTP_400_BAD_REQUEST)

    if username == settings.ADMIN_USERNAME and password == settings.ADMIN_PASSWORD:
        token = generate_token(username, is_admin=True)
        return Response(
            {
                "message": "Admin login successful!",
                "username": username,
                "token": token,
                "is_admin": True,
            },
            status=status.HTTP_200_OK,
        )

    if validate_user_credentials(username, password):
        token = generate_token(username, is_admin=False)
        return Response(
            {
                "message": "Login successful!",
                "username": username,
                "token": token,
                "is_admin": False,
            },
            status=status.HTTP_200_OK,
        )

    return Response({"error": "Invalid credentials"}, status=status.HTTP_401_UNAUTHORIZED)
