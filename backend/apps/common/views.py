from rest_framework import views, permissions, status
from rest_framework.response import Response
from django.db import connection
from django.core.cache import cache

class HealthCheckView(views.APIView):
    """
    Service health check endpoint (DEPLOYMENT §3, §7; MASTERPLAN §6.3).
    Checks database connection and cache accessibility.
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        db_ok = False
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                row = cursor.fetchone()
                db_ok = bool(row and row[0] == 1)
        except Exception:
            db_ok = False

        cache_ok = False
        try:
            cache.set("health_check_test", "ok", timeout=5)
            cache_ok = (cache.get("health_check_test") == "ok")
        except Exception:
            cache_ok = False

        all_ok = db_ok and cache_ok
        data = {
            "status": "ok" if all_ok else "degraded",
            "database": "ok" if db_ok else "error",
            "cache": "ok" if cache_ok else "error",
        }
        return Response(data, status=status.HTTP_200_OK if all_ok else status.HTTP_503_SERVICE_UNAVAILABLE)
