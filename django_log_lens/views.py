import json
import logging
import os
import re
from typing import Iterator
from urllib.parse import unquote

from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import user_passes_test
from django.http import (HttpResponse, HttpResponseBadRequest,
                         HttpResponseForbidden, StreamingHttpResponse)
from django.shortcuts import redirect, render
from django.views.decorators.http import require_http_methods

from . import get_handlers

client_logger = logging.getLogger("django_log_lens.client")

handlers = get_handlers()

LOG_LENS_DEBUG = getattr(settings, "LOG_LENS_DEBUG", False)

MSG_NO_LOG_DATA = (
    "NO LOG DATA AVAILABLE (FILE NOT FOUND)"  # reconcile with frontend constant
)
MISCONFIGURATION = "MISCONFIGURATION"  # reconcile with frontend constant
MISCONFIGURATION_MAP = [
    [MISCONFIGURATION, MISCONFIGURATION, MISCONFIGURATION, MISCONFIGURATION]
]

LOG_LEVEL_FUNCTIONAL_MAP = {
    "DEBUG": client_logger.debug,
    "INFO": client_logger.info,
    "WARNING": client_logger.warning,
    "ERROR": client_logger.error,
    "CRITICAL": client_logger.critical,
    "ASSERTION FAILED (CRITICAL)": client_logger.critical,
}


@require_http_methods(["POST"])
def logout_view(request):
    if request.user.is_authenticated:
        logout(request)
    return redirect("log-lens:login")


@require_http_methods(["GET", "POST"])
def login_view(request):
    if request.method == "POST":
        username = request.POST.get("username", "")
        password = request.POST.get("password", "")
        user = authenticate(username=username, password=password)
        if user is not None and user.is_superuser:  # type: ignore
            login(request, user)
            return redirect("log-lens:view")
        elif user is not None:
            return render(
                request,
                "log_lens/login.html",
                {"error_message": f"{username} is not a superuser"},
            )
        else:
            return render(
                request, "log_lens/login.html", {"error_message": "Invalid credentials"}
            )
    else:
        return render(request, "log_lens/login.html")


@require_http_methods(["POST"])
def log_client_msg(request):
    """
    Logs a client message and a stack trace provided by the POST request.
    Only for development purposes.
    """
    allow_js_logging = getattr(settings, "ALLOW_JS_LOGGING", False)
    if not allow_js_logging:
        return HttpResponseForbidden("Client logging is disabled")
    log = json.loads(request.body.decode("utf-8"))
    log_message = log["log_message"]
    log_level = log["severity"]
    LOG_LEVEL_FUNCTIONAL_MAP.get(log_level, client_logger.error)(log_message)
    return HttpResponse("Log message processed")


def stream_from_line(file_path: str, start_line: int) -> Iterator:
    """Stream file content in chunks, starting from the specified line number."""
    with open(file_path, "r") as f:
        # Skip lines before start_line
        for _ in range(start_line - 1):
            f.readline()

        # Stream remaining content in larger chunks for better performance
        chunk_size = 8192  # 8KB chunks
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            yield chunk


@require_http_methods(["GET", "DELETE"])
@user_passes_test(lambda user: user.is_superuser, login_url="log-lens:login")
def api_logfile(request, path: str):
    """
    - **GET**: Returns the contents of the log file specified by the path parameter
    **only if** the file is registered in the settings.LOGGING configuration.
    - **DELETE**: Clears the contents of the log file specified by the path parameter.
    **only if** the file is registered in the settings.LOGGING configuration.

    An optional "from" query parameter can be provided with GET requests to
    specify the starting line number from which to read the log file.

    A logged in superuser is required.
    """
    path = unquote(path)

    if path == MISCONFIGURATION:
        return HttpResponse(MISCONFIGURATION)

    if path not in get_valid_log_sources():
        return HttpResponseBadRequest(f"400 Bad Request: invalid log file path: {path}")

    if request.method == "GET":
        try:
            from_line = int(request.GET.get("from", 1))  # Default to 1, not -1
        except (TypeError, ValueError):
            return HttpResponseBadRequest("400 Bad Request: invalid parameter")

        try:
            return StreamingHttpResponse(stream_from_line(path, from_line))
        except FileNotFoundError:
            return HttpResponse(MSG_NO_LOG_DATA)
    elif request.method == "DELETE":
        with open(path, "r+") as f:
            f.truncate(0)
        return HttpResponse(f"Log file {path} cleared", status=204)
    else:
        return HttpResponseBadRequest("400 Bad Request: invalid HTTP method")


@require_http_methods(["GET"])
@user_passes_test(lambda user: user.is_superuser, login_url="log-lens:login")
def log_lens_view(request) -> HttpResponse:
    """
    Returns the log viewer page.
    A logged in superuser is required.
    """
    context = {"log_sources": get_source_mappings(), "LOG_LENS_DEBUG": LOG_LENS_DEBUG}
    return render(request, "log_lens/view.html", context)


def handler_name_to_normalized_path(handler_name: str) -> str:
    """
    Converts a logging handler name to a normalized file path if it's a file handler.
    """
    path = settings.LOGGING["handlers"][handler_name]["filename"]
    return path.replace("\\", "/").replace("//", "/")


def get_source_mappings() -> list[list[str]]:
    """
    Returns a list of [handler_name, file_path, file_name] for each file handler defined in settings.LOGGING.
    """
    try:
        paths = []
        for handler_name in settings.LOGGING["handlers"]:
            has_filename = "filename" in settings.LOGGING["handlers"][handler_name]
            is_file_handler = (
                settings.LOGGING["handlers"][handler_name]["class"] in handlers
            )
            if has_filename and is_file_handler:
                path = handler_name_to_normalized_path(handler_name)
                file_name = path.split("/")[-1] if path.split("/") else path
                backup_slots = get_backup_slots(path)
                paths.append([handler_name, path, file_name, backup_slots])
        return paths
    except KeyError:
        return MISCONFIGURATION_MAP


def get_valid_log_sources() -> set[str]:
    """
    Returns a set of valid log file paths defined in settings.LOGGING.
    """
    valid_sources = set()
    try:
        for handler_name in settings.LOGGING["handlers"]:
            has_filename = "filename" in settings.LOGGING["handlers"][handler_name]
            is_file_handler = (
                settings.LOGGING["handlers"][handler_name]["class"] in handlers
            )
            if has_filename and is_file_handler:
                path = handler_name_to_normalized_path(handler_name)
                valid_sources.add(path)
                for backup in get_backup_slots(path):
                    valid_sources.add(backup[0])
        return valid_sources
    except KeyError:
        return set()


def get_backup_slots(path: str) -> list[list[str]]:
    """
    Returns a list of backup log file slots for the given log file path.
    Each slot is represented as a list: [full_path, file_name]
    """
    backup_slots = []
    directory, original_filename = os.path.split(path)
    if not os.path.exists(directory):
        return backup_slots

    pattern_numeric = re.compile(re.escape(original_filename) + r"\.(\d+)$")
    pattern_date = re.compile(
        re.escape(original_filename) + r"\.(\d{4}-[A-Za-z0-9_-]+)$"
    )

    for file in sorted(os.listdir(directory)):
        match_numeric = pattern_numeric.match(file)
        match_date = pattern_date.match(file)
        if match_numeric or match_date:
            full_path = os.path.join(directory, file)
            backup_slots.append([full_path, file])

    return backup_slots
