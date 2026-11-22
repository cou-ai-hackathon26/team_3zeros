import base64
from rest_framework.pagination import CursorPagination as DRFCursorPagination
from rest_framework.response import Response

class CursorPagination(DRFCursorPagination):
    """
    Standard cursor pagination as specified in MASTERPLAN §6.1 / BACKEND §11.
    Query params: ?cursor=&limit= (max 100).
    Envelope: { "results": [...], "next_cursor": "..." | null }
    """
    page_size = 20
    page_size_query_param = "limit"
    max_page_size = 100
    ordering = "-created_at"
    cursor_query_param = "cursor"

    def get_paginated_response(self, data):
        next_url = self.get_next_link()
        next_cursor = None
        if next_url:
            # extract cursor param from next_url
            from urllib.parse import urlparse, parse_qs
            parsed = urlparse(next_url)
            params = parse_qs(parsed.query)
            next_cursor = params.get(self.cursor_query_param, [None])[0]

        return Response({
            "results": data,
            "next_cursor": next_cursor,
        })
