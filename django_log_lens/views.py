import json
import logging
import os

from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import user_passes_test
from django.http import (HttpResponse, HttpResponseBadRequest,
                         HttpResponseForbidden, JsonResponse)
from django.shortcuts import redirect, render
from django.views.decorators.http import require_http_methods

BAD_REQUEST_HANDLER_NAME_NOT_PROVIDED = HttpResponseBadRequest("400 Bad Request: no handler name provided")

file_handlers = {
    "logging.FileHandler",
    "logging.handlers.RotatingFileHandler",
    "logging.handlers.TimedRotatingFileHandler",
    "logging.handlers.WatchedFileHandler",
}

client_logger = logging.getLogger("django_log_lens.client")

log_level_functional_map = {
    "DEBUG": client_logger.debug,
    "INFO": client_logger.info,
    "WARNING": client_logger.warning,
    "ERROR": client_logger.error,
    "CRITICAL": client_logger.critical,
    "ASSERTION FAILED (CRITICAL)": client_logger.critical
}


@require_http_methods(["POST"])
def logout_view(request):
    if request.user.is_authenticated:
        logout(request)
    return redirect('log-lens:login')


@require_http_methods(["GET", "POST"])
def login_view(request):
    if request.method == 'POST':
        username = request.POST.get('username', '')
        password = request.POST.get('password', '')
        user = authenticate(username=username, password=password)
        if user is not None and user.is_superuser:  # type: ignore
            login(request, user)
            return redirect('log-lens:view')
        elif user is not None:
            return render(request, 'log-lens-login.html', {'error_message': f'{username} is not a superuser'})
        else:
            return render(request, 'log-lens-login.html', {'error_message': 'Invalid credentials'})
    else:
        return render(request, 'log-lens-login.html')


@require_http_methods(["POST"])
def log_js_error(request):
    """
    Logs the error message and stack trace provided by the POST request.
    Only for development purposes, don't use in production.
    """
    try:
        allow_js_logging = settings.ALLOW_JS_LOGGING
    except AttributeError:
        allow_js_logging = False
    if not allow_js_logging:
        return HttpResponseForbidden("Client logger is disabled.")
    log = json.loads(request.body.decode('utf-8'))
    log_message = log['log_message']
    log_level = log['severity']
    log_level_functional_map.get(log_level, client_logger.error)(log_message)
    return HttpResponse("Log message processed.")


@require_http_methods(["GET"])
@user_passes_test(lambda user: user.is_superuser, login_url='log-lens:login')
def request_logfile(request) -> HttpResponse:
    """
    Returns the contents of the log file associated with the handler_name
    defined in the query string.
    A logged in superuser is required.
    """
    handler_name = request.GET.get('handler_name', None)
    if handler_name is None:
        return BAD_REQUEST_HANDLER_NAME_NOT_PROVIDED
    try:
        filename = settings.LOGGING['handlers'][handler_name]['filename']
        with open(filename, 'r') as f:
            ti_m = os.path.getmtime(filename)
            return JsonResponse({"text": f.read(), "timestamp": f"{ti_m}"})
    except FileNotFoundError:
        return JsonResponse({"text": f"Log file {filename} not found", "timestamp": "0"})
    except KeyError:
        return JsonResponse(
            {"text": "Improperly configured.\nPlease check the LOGGING configuration"
             " in your settings.py", "timestamp": "0"})


@require_http_methods(["GET"])
@user_passes_test(lambda user: user.is_superuser, login_url='log-lens:login')
def request_logfile_timestamp(request) -> HttpResponse:
    """
    Returns the timestamp of the logfile associated with the handler_name
    defined in the query string.
    A logged in superuser is required.
    """
    handler_name = request.GET.get('handler_name', None)
    if handler_name is None:
        return BAD_REQUEST_HANDLER_NAME_NOT_PROVIDED
    try:
        filename = settings.LOGGING['handlers'][handler_name]['filename']
        ti_m = os.path.getmtime(filename)
        return JsonResponse({"timestamp": f"{ti_m}"})
    except (FileNotFoundError, KeyError):
        return JsonResponse({"timestamp": "0"})


@require_http_methods(["DELETE"])
@user_passes_test(lambda user: user.is_superuser, login_url='log-lens:login')
def clear_logfile(request) -> HttpResponse:
    """
    Clears the contents of the log file specified by the handler_name GET parameter.
    A logged in superuser is required.
    """
    handler_name = request.GET.get('handler_name', None)
    if handler_name is None:
        return BAD_REQUEST_HANDLER_NAME_NOT_PROVIDED
    filename = settings.LOGGING['handlers'][handler_name]['filename']
    try:
        with open(filename, 'w') as f:
            f.write("")
        return HttpResponse(f"Log file {filename} cleared")
    except FileNotFoundError:
        return HttpResponse("No logs available")


@require_http_methods(["GET"])
@user_passes_test(lambda user: user.is_superuser, login_url='log-lens:login')
def request_logfile_paths(request) -> JsonResponse | HttpResponseBadRequest:
    """
    Returns a JSON object containing the paths of all log files
    associated with any file handlers defined in the LOGGING configuration.
    A logged in superuser is required.
    """
    try:
        paths = {}
        for handler_name in settings.LOGGING['handlers']:
            has_filename = 'filename' in settings.LOGGING['handlers'][handler_name]
            is_file_handler = settings.LOGGING['handlers'][handler_name]['class'] in file_handlers
            if has_filename and is_file_handler:
                paths[handler_name] = settings.LOGGING['handlers'][handler_name]['filename']
        return JsonResponse(paths)
    except KeyError:
        return JsonResponse({})


@require_http_methods(["GET"])
@user_passes_test(lambda user: user.is_superuser, login_url='log-lens:login')
def log_lens_view(request) -> HttpResponse:
    """
    Returns the log viewer page.
    A logged in superuser is required.
    """
    return render(request, 'log-lens.html')
