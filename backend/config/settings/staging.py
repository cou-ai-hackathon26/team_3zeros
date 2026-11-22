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
