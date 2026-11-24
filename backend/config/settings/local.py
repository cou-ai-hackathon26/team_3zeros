from .base import *

DEBUG = True
ALLOWED_HOSTS = ["*"]

CSRF_TRUSTED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3100",
    "http://127.0.0.1:3100",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]

# Postgres with pgvector everywhere (MASTERPLAN D-32). Start it with: docker compose -f docker-compose.dev.yml up -d
DATABASES = {
    "default": env.db("DATABASE_URL", default="postgres://medi:medi_secret@localhost:5432/medi_waypoint")
}

# In local testing, use in-memory channel layer or dummy
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer"
    }
}

FHIR_SYNC_MODE = "stub"

# Fixed OTP and MFA code for local development only (audit A-02).
DEV_FIXED_CODES = True
