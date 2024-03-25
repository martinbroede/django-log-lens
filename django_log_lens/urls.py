from django.shortcuts import redirect
from django.urls import path

from .views import (clear_logfile, log_js_error, log_lens_view, login_view,
                    logout_view, request_logfile, request_logfile_paths,
                    request_logfile_timestamp)

app_name = "log-lens"

urlpatterns = [
    path('', lambda _: redirect('log-lens:view')),
    path('request/paths', request_logfile_paths, name="request-logfile-paths"),
    path('request/file', request_logfile, name="request-logfile"),
    path('request/timestamp', request_logfile_timestamp, name="request-logfile-timestamp"),
    path('post', log_js_error, name="post-log"),
    path('clear/file', clear_logfile, name="clear"),
    path('view', log_lens_view, name="view"),
    path("login", login_view, name="login"),
    path("logout", logout_view, name="logout"),
]
