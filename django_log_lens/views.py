import json
import logging
import os
import re
import shutil
import stat
from collections.abc import Iterator
from datetime import datetime
from typing import Any
from urllib.parse import unquote

from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import user_passes_test
from django.http import (
    HttpResponse, HttpResponseBadRequest, HttpResponseForbidden, JsonResponse,
    StreamingHttpResponse,
)
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

ARCHIVE_DIR_NAME = "archive"
ARCHIVE_TIMESTAMP_FORMAT = "%Y-%m-%d_%H-%M-%S"
ARCHIVE_MAX_COLLISION_SUFFIX = 100

SEARCH_MAX_TERM_LENGTH = 200
SEARCH_MAX_MATCHES_PER_SOURCE = 200
SEARCH_MAX_TOTAL_MATCHES = 1000
SEARCH_MAX_LINE_LENGTH = 1000

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
    Logs a client-provided message (the frontend's logger.js already inlines any stack
    trace into the message itself) at the severity given in the POST body.
    Only for development purposes.
    """
    allow_js_logging = getattr(settings, "ALLOW_JS_LOGGING", False)
    if not allow_js_logging:
        return HttpResponseForbidden("Client logging is disabled")  # pyright: ignore[reportArgumentType]
    try:
        log = json.loads(request.body.decode("utf-8"))
        log_message = log["log_message"]
        log_level = log["severity"]
    except (json.JSONDecodeError, KeyError, UnicodeDecodeError):
        return HttpResponseBadRequest("400 Bad Request: invalid log payload")  # pyright: ignore[reportArgumentType]
    LOG_LEVEL_FUNCTIONAL_MAP.get(log_level, client_logger.error)(log_message)
    return HttpResponse("Log message processed")  # pyright: ignore[reportArgumentType]


def stream_from_line(file_path: str, start_line: int) -> Iterator[str]:
    """
    Stream file content in chunks, starting from the specified line number.

    A log file that does not exist yields the no-data message instead of raising, so that a
    handler which has not written anything yet is reported rather than breaking the response
    half way through.

    The file is opened inside the generator and held by a "with" block, so it is closed both
    when the stream runs out and when the client disconnects early -- Django closes the
    generator, which raises GeneratorExit at the yield below. Opening it eagerly instead
    would leave the descriptor to the garbage collector whenever the response is built but
    never iterated.
    """
    try:
        file = open(file_path, "r")
    except FileNotFoundError:
        yield MSG_NO_LOG_DATA
        return

    with file:
        # Skip lines before start_line
        for _ in range(start_line - 1):
            file.readline()

        # Stream remaining content in larger chunks for better performance
        chunk_size = 8192  # 8KB chunks
        while True:
            chunk = file.read(chunk_size)
            if not chunk:
                break
            yield chunk


@require_http_methods(["GET", "DELETE"])
@user_passes_test(lambda user: user.is_superuser, login_url="log-lens:login")
def api_logfile(request, path: str):
    """
    - **GET**: Returns the contents of the log file specified by the path parameter
    **only if** the file is registered in the settings.LOGGING configuration
    or has been archived by Log Lens (see api_archive).
    - **DELETE**: Clears the contents of the log file specified by the path parameter.
    **only if** the file is registered in the settings.LOGGING configuration.
    Archived files are never cleared -- they are removed via api_archive instead.

    An optional "from" query parameter can be provided with GET requests to
    specify the starting line number from which to read the log file.

    A logged in superuser is required.
    """
    path = unquote(path)

    if path == MISCONFIGURATION:
        return HttpResponse(MISCONFIGURATION)

    if request.method == "GET":
        if path not in get_valid_log_sources() and path not in get_archived_sources():
            return HttpResponseBadRequest(f"400 Bad Request: invalid log file path: {path}")
        try:
            from_line = int(request.GET.get("from", 1))  # Default to 1, not -1
        except (TypeError, ValueError):
            return HttpResponseBadRequest("400 Bad Request: invalid parameter")

        # a missing file is reported by the stream itself, see stream_from_line()
        return StreamingHttpResponse(stream_from_line(path, from_line))  # pyright: ignore[reportArgumentType]

    # request.method == "DELETE" -- the only other method allowed by @require_http_methods
    if path not in get_valid_log_sources():
        return HttpResponseBadRequest(f"400 Bad Request: invalid log file path: {path}")

    with open(path, "r+") as f:
        f.truncate(0)
    return HttpResponse(f"Log file {path} cleared", status=204)


def search_log_source(
    path: str, needle: bytes, case_sensitive: bool, max_matches: int
) -> dict[str, Any]:
    """
    Searches a single log file for the given needle and returns

        {"matches": [[line_number, line_text], ...], "truncated": bool, "error": str | None}

    The file is read in binary mode one line at a time so that a large log file never has
    to be held in memory, and only the lines that actually match are decoded. Matching is
    plain substring matching (no regex), which keeps the cost linear in the file size and
    makes a user-provided term harmless.

    Case-insensitive matching lowercases bytes, i.e. it only folds ASCII -- the needle is
    expected to have been lowercased the same way by the caller.
    """
    matches: list[list[Any]] = []
    truncated = False
    try:
        with open(path, "rb") as f:
            for line_number, raw_line in enumerate(f, start=1):
                haystack = raw_line if case_sensitive else raw_line.lower()
                if needle not in haystack:
                    continue
                if len(matches) >= max_matches:
                    truncated = True
                    break
                text = raw_line.decode("utf-8", errors="replace").rstrip("\r\n")
                matches.append([line_number, text[:SEARCH_MAX_LINE_LENGTH]])
    except FileNotFoundError:
        return {"matches": matches, "truncated": False, "error": MSG_NO_LOG_DATA}
    except OSError as error:
        return {"matches": matches, "truncated": False, "error": f"{type(error).__name__}: {error}"}
    return {"matches": matches, "truncated": truncated, "error": None}


@require_http_methods(["GET"])
@user_passes_test(lambda user: user.is_superuser, login_url="log-lens:login")
def api_search(request) -> HttpResponse:
    """
    Searches every valid log source (see get_valid_log_sources()) for the substring given
    in the "q" query parameter and returns the matching lines grouped by source as JSON.
    An optional "case_sensitive=true" parameter makes the search case-sensitive.

    Only files belonging to a recognized handler in settings.LOGGING are searched -- the
    request never names a path, so this endpoint cannot be pointed at arbitrary files.
    Archived files are deliberately excluded so that a match is never reported twice.

    The number of matches is capped (per source and in total) so that a very common search
    term cannot produce an unbounded response; the caps that were hit are reported back.

    A logged in superuser is required.
    """
    term = request.GET.get("q", "")
    case_sensitive = request.GET.get("case_sensitive", "").lower() == "true"

    if not term.strip():
        return HttpResponseBadRequest("400 Bad Request: missing search term")  # pyright: ignore[reportArgumentType]
    if len(term) > SEARCH_MAX_TERM_LENGTH:
        message = f"400 Bad Request: search term must not exceed {SEARCH_MAX_TERM_LENGTH} characters"
        return HttpResponseBadRequest(message)  # pyright: ignore[reportArgumentType]

    needle = term.encode("utf-8")
    if not case_sensitive:
        needle = needle.lower()

    sources = sorted(get_valid_log_sources())
    results = []
    total_matches = 0
    limit_reached = False
    sources_searched = 0

    for path in sources:
        max_matches = min(SEARCH_MAX_MATCHES_PER_SOURCE, SEARCH_MAX_TOTAL_MATCHES - total_matches)
        if max_matches <= 0:
            # the overall match limit is exhausted; the remaining sources stay unsearched
            limit_reached = True
            break

        result = search_log_source(path, needle, case_sensitive, max_matches)
        sources_searched += 1
        total_matches += len(result["matches"])
        limit_reached = limit_reached or result["truncated"]

        if result["matches"] or result["error"]:
            results.append({
                "source": path,
                "name": os.path.basename(path),
                "matches": result["matches"],
                "truncated": result["truncated"],
                "error": result["error"],
            })

    return JsonResponse({  # pyright: ignore[reportReturnType]
        "term": term,
        "case_sensitive": case_sensitive,
        "results": results,
        "total_matches": total_matches,
        "sources_searched": sources_searched,
        "sources_total": len(sources),
        "limit_reached": limit_reached,
    })


@require_http_methods(["GET", "POST", "DELETE"])
@user_passes_test(lambda user: user.is_superuser, login_url="log-lens:login")
def api_archive(request) -> HttpResponse:
    """
    - **GET**: Returns every archived log file as JSON (see get_archive_entries()).
    - **POST**: Archives the log source named in the JSON body's "source" key, i.e. copies
    it into the "archive" folder next to it, timestamped. Only a source that is currently
    registered in settings.LOGGING (or one of its rotated backups) can be archived.
    - **DELETE**: Permanently removes the archived file named in the "source" query
    parameter, or every archived file when "all=true" is given instead. Only files that are
    already known as archived files can be removed, so this cannot be pointed at a live log
    file or at an arbitrary path.

    A logged in superuser is required.
    """
    if request.method == "GET":
        return JsonResponse({"entries": get_archive_entries()})  # pyright: ignore[reportReturnType]

    if request.method == "POST":
        try:
            source = json.loads(request.body.decode("utf-8"))["source"]
        except (json.JSONDecodeError, KeyError, TypeError, UnicodeDecodeError):
            return HttpResponseBadRequest("400 Bad Request: invalid payload")  # pyright: ignore[reportArgumentType]

        if source not in get_valid_log_sources():
            message = f"400 Bad Request: invalid log file path: {source}"
            return HttpResponseBadRequest(message)  # pyright: ignore[reportArgumentType]

        try:
            archived_path = archive_log_source(source)
        except FileNotFoundError:
            return HttpResponseBadRequest(f"400 Bad Request: {MSG_NO_LOG_DATA}")  # pyright: ignore[reportArgumentType]
        except OSError as error:
            message = f"500 Internal Server Error: {type(error).__name__}: {error}"
            return HttpResponse(message, status=500)  # pyright: ignore[reportArgumentType]

        return JsonResponse({  # pyright: ignore[reportReturnType]
            "source": archived_path,
            "name": os.path.basename(archived_path),
            "entries": get_archive_entries(),
        })

    # request.method == "DELETE" -- the only other method allowed by @require_http_methods
    if request.GET.get("all", "").lower() == "true":
        deleted = delete_all_archived_sources()
        return JsonResponse({"deleted": deleted, "entries": get_archive_entries()})  # pyright: ignore[reportReturnType]

    source = request.GET.get("source", "")  # already decoded by Django, unlike the path captured in the URL
    if source not in get_archived_sources():
        message = f"400 Bad Request: invalid archived file path: {source}"
        return HttpResponseBadRequest(message)  # pyright: ignore[reportArgumentType]

    try:
        os.remove(source)
    except OSError as error:
        message = f"500 Internal Server Error: {type(error).__name__}: {error}"
        return HttpResponse(message, status=500)  # pyright: ignore[reportArgumentType]

    return JsonResponse({"deleted": [source], "entries": get_archive_entries()})  # pyright: ignore[reportReturnType]


@require_http_methods(["GET"])
@user_passes_test(lambda user: user.is_superuser, login_url="log-lens:login")
def log_lens_view(request) -> HttpResponse:
    """
    Returns the log viewer page.
    A logged in superuser is required.
    """
    context = {"log_sources": get_source_mappings(), "LOG_LENS_DEBUG": LOG_LENS_DEBUG}
    return render(request, "log_lens/view.html", context)


def normalize_path(path: str) -> str:
    """
    Normalizes a file path to the forward-slash spelling Log Lens compares paths by.
    """
    return path.replace("\\", "/").replace("//", "/")


def handler_name_to_normalized_path(handler_name: str) -> str:
    """
    Converts a logging handler name to a normalized file path if it's a file handler.
    """
    return normalize_path(settings.LOGGING["handlers"][handler_name]["filename"])


def is_recognized_file_handler(handler_name: str) -> bool:
    """
    Returns True if the given handler name refers to a file handler recognized by Log Lens,
    i.e. it has a "filename" key and its "class" was registered via add_handler() (or is one
    of the default stdlib file handlers).
    """
    handler_config = settings.LOGGING["handlers"][handler_name]
    return "filename" in handler_config and handler_config["class"] in handlers


def iter_recognized_file_handlers() -> Iterator[tuple[str, str]]:
    """
    Yields (handler_name, normalized_file_path) for each file handler defined in
    settings.LOGGING that is recognized by Log Lens (see is_recognized_file_handler()).
    """
    for handler_name in settings.LOGGING["handlers"]:
        if is_recognized_file_handler(handler_name):
            yield handler_name, handler_name_to_normalized_path(handler_name)


def get_source_mappings() -> list[list[Any]]:
    """
    Returns a list of [handler_name, file_path, file_name, backup_slots] for each file
    handler defined in settings.LOGGING. backup_slots is itself a list[list[str]] (see
    get_backup_slots()), so each row is heterogeneous rather than list[str].
    """
    try:
        return [
            [handler_name, path, os.path.basename(path), get_backup_slots(path)]
            for handler_name, path in iter_recognized_file_handlers()
        ]
    except KeyError:
        return MISCONFIGURATION_MAP


def get_valid_log_sources() -> set[str]:
    """
    Returns a set of valid log file paths defined in settings.LOGGING, including
    rotated backup files discovered next to each handler's primary file.
    """
    valid_sources = set()
    try:
        for _, path in iter_recognized_file_handlers():
            valid_sources.add(path)
            valid_sources.update(backup[0] for backup in get_backup_slots(path))
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


def get_archive_directory(path: str) -> str:
    """
    Returns the archive folder belonging to the given log file, i.e. the "archive"
    folder inside the folder the log file itself lives in.
    """
    return normalize_path(f"{os.path.dirname(path)}/{ARCHIVE_DIR_NAME}")


def get_archive_directories() -> set[str]:
    """
    Returns the archive folders of every log file defined in settings.LOGGING.
    Rotated backups live next to their primary file, so they share its archive folder.
    """
    try:
        return {get_archive_directory(path) for _, path in iter_recognized_file_handlers()}
    except KeyError:
        return set()


def get_archived_sources() -> set[str]:
    """
    Returns the paths of all archived log files, i.e. every file inside one of the
    archive folders returned by get_archive_directories().
    """
    return {entry["source"] for entry in get_archive_entries()}


def get_archive_entries() -> list[dict[str, Any]]:
    """
    Returns the archived log files as a list of

        {"source": path, "name": file_name, "directory": archive_folder,
         "size": bytes, "archived_at": posix_timestamp}

    sorted by archiving time, most recent first. Only regular files directly inside an
    archive folder are reported -- sub folders and anything unreadable are skipped.
    """
    entries: list[dict[str, Any]] = []

    for directory in get_archive_directories():
        try:
            file_names = os.listdir(directory)
        except OSError:
            continue  # the archive folder does not exist (yet) or is not readable

        for file_name in file_names:
            source = f"{directory}/{file_name}"
            try:
                stats = os.stat(source)
            except OSError:
                continue
            if not stat.S_ISREG(stats.st_mode):
                continue
            entries.append({
                "source": source,
                "name": file_name,
                "directory": directory,
                "size": stats.st_size,
                "archived_at": stats.st_mtime,
            })

    entries.sort(key=lambda entry: (-entry["archived_at"], entry["source"]))
    return entries


def build_archive_path(path: str, timestamp: str) -> str:
    """
    Returns the path an archived copy of the given log file is written to, i.e.
    "<log folder>/archive/<file name>.<timestamp><extension>" -- the timestamp goes before
    the extension so that "app.log" is archived as "app.<timestamp>.log" and still opens as
    a log file. A numeric suffix is appended if that name is taken already, so archiving the
    same file twice within a second never overwrites the earlier copy.
    """
    directory = get_archive_directory(path)
    stem, extension = os.path.splitext(os.path.basename(path))
    candidate = f"{directory}/{stem}.{timestamp}{extension}"

    for suffix in range(1, ARCHIVE_MAX_COLLISION_SUFFIX + 1):
        if not os.path.exists(candidate):
            return candidate
        candidate = f"{directory}/{stem}.{timestamp}-{suffix}{extension}"

    raise FileExistsError(f"could not find a free archive slot for {path}")


def archive_log_source(path: str) -> str:
    """
    Copies the given log file into its archive folder and returns the path of the copy.
    The copy is not given the original's modification time, so that the file system
    records when the file was archived rather than when it was last written to.
    """
    os.makedirs(get_archive_directory(path), exist_ok=True)
    archive_path = build_archive_path(path, datetime.now().strftime(ARCHIVE_TIMESTAMP_FORMAT))
    shutil.copyfile(path, archive_path)
    return archive_path


def delete_all_archived_sources() -> list[str]:
    """
    Removes every archived log file and returns the paths that were actually removed.
    Only files inside an archive folder are touched -- the folders themselves and the log
    files they were copied from stay untouched. A file that cannot be removed is left in
    place and stays part of the archive listing the caller is given afterwards.
    """
    deleted = []

    for source in sorted(get_archived_sources()):
        try:
            os.remove(source)
        except OSError:
            continue
        deleted.append(source)

    return deleted
