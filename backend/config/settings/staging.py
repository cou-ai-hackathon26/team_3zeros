from .base import *

DEBUG = False
DATABASES = {
    "default": env.db("DATABASE_URL")
}

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [env("REDIS_URL", default="redis://redis:6379/1")],
        },
    },
}

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": env("REDIS_CACHE_URL", default=env("REDIS_URL", default="redis://redis:6379/1")),
    }
}

CELERY_TASK_ALWAYS_EAGER = False

