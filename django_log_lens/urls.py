from django.shortcuts import redirect
from django.urls import path

from .views import (delete_file, get_timestamp, log_js_error, log_lens_view,
                    log_lens_view_v2, logfile_api, login_view, logout_view,
                    request_logfile, request_logfile_paths)

app_name = "log-lens"

urlpatterns = [
    path('', lambda _: redirect('log-lens:view')),
    path('api/files/<path:path>/', logfile_api, name="log-file-api"),

    path('request/paths', request_logfile_paths, name="request-logfile-paths"),  # todo remove
    path('request/file', request_logfile, name="request-logfile"),  # todo remove
    path('request/timestamp', get_timestamp, name="request-logfile-timestamp"),  # todo remove
    path('clear/file', delete_file, name="clear"),  # todo remove

    path('post', log_js_error, name="post-log"),  # todo rename this endpoint
    path('view', log_lens_view, name="view"),
    path('view/v2', log_lens_view_v2, name="view-v2"),

    path("login", login_view, name="login"),
    path("logout", logout_view, name="logout"),
]
