from django.conf import settings
from django.shortcuts import redirect
from django.urls import path

from .event_stream import sse_endpoint
from .views import (api_logfile, log_client_msg, log_lens_view, login_view,
                    logout_view)

app_name = "log-lens"

urlpatterns = [
    path('', lambda _: redirect('log-lens:view')),

    path('view/', log_lens_view, name="view"),

    path("login/", login_view, name="login"),
    path("logout/", logout_view, name="logout"),

    path('api/sources/stream', sse_endpoint, name="stream-api"),
    path('api/sources/files', lambda _: redirect('log-lens:view'), name="log-file-api-endpoint"),
    path('api/sources/files/<path:path>/', api_logfile, name="log-file-api")
]

if getattr(settings, "ALLOW_JS_LOGGING", False):
    urlpatterns.append(path('api/logs/', log_client_msg, name="log-api"))
