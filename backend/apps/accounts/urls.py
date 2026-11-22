from django.urls import path
from .views import (
    LoginView,
    MfaVerifyView,
    OtpRequestView,
    OtpVerifyView,
    LogoutView,
    MeView,
    ActiveFacilityView,
)

urlpatterns = [
    path("login", LoginView.as_view(), name="auth-login"),
    path("mfa/verify", MfaVerifyView.as_view(), name="auth-mfa-verify"),
    path("otp/request", OtpRequestView.as_view(), name="auth-otp-request"),
    path("otp/verify", OtpVerifyView.as_view(), name="auth-otp-verify"),
    path("logout", LogoutView.as_view(), name="auth-logout"),
    path("me", MeView.as_view(), name="auth-me"),
    path("active-facility", ActiveFacilityView.as_view(), name="auth-active-facility"),
]
