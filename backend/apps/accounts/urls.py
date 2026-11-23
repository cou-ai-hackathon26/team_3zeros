from django.urls import path
from .views import (
    LoginView,
    AdminLoginView,
    MfaVerifyView,
    RegisterView,
    LogoutView,
    MeView,
    ActiveFacilityView,
)

urlpatterns = [
    path("login", LoginView.as_view(), name="auth-login"),
    path("admin/login", AdminLoginView.as_view(), name="auth-admin-login"),
    path("mfa/verify", MfaVerifyView.as_view(), name="auth-mfa-verify"),
    path("register", RegisterView.as_view(), name="auth-register"),
    path("logout", LogoutView.as_view(), name="auth-logout"),
    path("me", MeView.as_view(), name="auth-me"),
    path("active-facility", ActiveFacilityView.as_view(), name="auth-active-facility"),
]

