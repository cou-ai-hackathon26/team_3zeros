import os
from pathlib import Path
import environ

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env(
    DEBUG=(bool, False),
    SECRET_KEY=(str, "insecure-dev-key-change-in-production-medi-waypoint"),
    ALLOWED_HOSTS=(list, ["127.0.0.1", "localhost"]),
    TIME_ZONE=(str, "Asia/Dhaka"),
    FEATURE_VOICE_TRIAGE=(bool, False),      # Q-05
    FEATURE_BREAK_GLASS=(bool, False),       # Q-07
    FEATURE_NATIONAL_ID=(bool, False),       # Q-10
    FEATURE_PATIENT_UPLOAD=(bool, False),    # Q-11
    FEATURE_OFFLINE_EMERGENCY=(bool, False), # Q-09
    FHIR_SERVER_URL=(str, "http://localhost:8080/fhir"),
    FHIR_TIMEOUT_SECONDS=(int, 5),
    FHIR_SYNC_MODE=(str, "live"),
)

# Read single root .env (or backend/.env fallback) if present
for candidate_env in (BASE_DIR.parent / ".env", BASE_DIR / ".env"):
    if candidate_env.exists():
        environ.Env.read_env(str(candidate_env))
        break

SECRET_KEY = env("SECRET_KEY")
DEBUG = env("DEBUG")
ALLOWED_HOSTS = env("ALLOWED_HOSTS")

CSRF_TRUSTED_ORIGINS = env.list(
    "CSRF_TRUSTED_ORIGINS",
    default=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3100",
        "http://127.0.0.1:3100",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
)

# Feature Flags (MASTERPLAN §8.2 / BACKEND §3)
FEATURE_VOICE_TRIAGE = env("FEATURE_VOICE_TRIAGE")
FEATURE_BREAK_GLASS = env("FEATURE_BREAK_GLASS")
FEATURE_NATIONAL_ID = env("FEATURE_NATIONAL_ID")
FEATURE_PATIENT_UPLOAD = env("FEATURE_PATIENT_UPLOAD")
FEATURE_OFFLINE_EMERGENCY = env("FEATURE_OFFLINE_EMERGENCY")

# FHIR configuration
FHIR_SERVER_URL = env("FHIR_SERVER_URL")
FHIR_TIMEOUT_SECONDS = env("FHIR_TIMEOUT_SECONDS")
# "live" writes to HAPI. "stub" skips the write and is for local/test only:
# it would violate INV-12 in production, so production/staging must stay "live".
FHIR_SYNC_MODE = env("FHIR_SYNC_MODE")

# Local development and tests accept the fixed code 123456 for OTP and MFA. Must stay False everywhere else (audit A-02).
DEV_FIXED_CODES = False
# Staff and admin sessions end after 15 idle minutes (SECURITY §3.3); the expiry slides on every request.
SESSION_SAVE_EVERY_REQUEST = True
STAFF_SESSION_SECONDS = 15 * 60

# Application definition
DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "drf_spectacular",
    "channels",
]

LOCAL_APPS = [
    "apps.common",
    "apps.workflow",
    "apps.audit",
    "apps.accounts",
    "apps.identity",
    "apps.organizations",
    "apps.directory",
    "apps.scheduling",
    "apps.referrals",
    "apps.consent",
    "apps.notifications",
    "apps.records",
    "apps.documents",
    "apps.triage",
    "apps.fhir",
    "apps.ai",
    "apps.emergency_dept",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "apps.common.middleware.RequestIdMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "apps.common.middleware.IdempotencyMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# Custom User Model
AUTH_USER_MODEL = "accounts.User"

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Internationalization
LANGUAGE_CODE = "en-us"
TIME_ZONE = env("TIME_ZONE")
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# Default primary key field type
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# REST Framework settings
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "EXCEPTION_HANDLER": "apps.common.exception_handler.custom_exception_handler",
    "DEFAULT_PAGINATION_CLASS": "apps.common.pagination.CursorPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

# drf-spectacular OpenAPI 3.1 configuration
SPECTACULAR_SETTINGS = {
    "TITLE": "Medi Waypoint API",
    "DESCRIPTION": "Healthcare referral, triage, and scheduling API for Bangladesh",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "OAS_VERSION": "3.1.0",
    "COMPONENT_SPLIT_REQUEST": True,
}

