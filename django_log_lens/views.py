import json
import logging
import os

from django.conf import settings
from django.contrib.auth.decorators import login_required, user_passes_test
from django.http import HttpResponse, HttpResponseBadRequest, JsonResponse
from django.middleware.csrf import get_token
from django.template import loader

REQUEST_METHOD_NOT_ALLOWED_TEXT = "request method not allowed"
HANDLER_NAME_NOT_PROVIDED_TEXT = "400 Bad Request: handler_name not provided"
ALLOW_JS_LOGGING = True

client_logger = logging.getLogger("client_logger")

log_level_functional_map = {
    "DEBUG": client_logger.debug,
    "INFO": client_logger.info,
    "WARNING": client_logger.warning,
    "ERROR": client_logger.error,
    "CRITICAL": client_logger.critical,
    "ASSERTION FAILED (CRITICAL)": client_logger.critical
}


@login_required
def log_js_error(request):
    """Logs the error message and stack trace provided by the POST request."""
    if request.method != 'POST':
        return HttpResponseBadRequest(REQUEST_METHOD_NOT_ALLOWED_TEXT)
    if not ALLOW_JS_LOGGING:
        return HttpResponseBadRequest("JS logging is not allowed")
    log = json.loads(request.body.decode('utf-8'))
    log_message = log['error_message']
    log_level = log['severity']
    log_level_functional_map.get(log_level, client_logger.error)(log_message)
    return HttpResponse("Error logged")


@user_passes_test(lambda u: u.is_superuser)
def request_logfile(request) -> HttpResponse:
    """
    Returns the contents of the log file specified by the handler_name GET parameter.
    A logged in superuser is required.
    """
    if request.method != 'GET':
        return HttpResponseBadRequest(REQUEST_METHOD_NOT_ALLOWED_TEXT)
    handler_name = request.GET.get('handler_name', None)
    if handler_name is None:
        return HttpResponseBadRequest(HANDLER_NAME_NOT_PROVIDED_TEXT)
    filename = settings.LOGGING['handlers'][handler_name]['filename']
    try:
        with open(filename, 'r') as f:
            ti_m = os.path.getmtime(filename)
            return JsonResponse({"text": f.read(), "timestamp": f"{ti_m}"})
    except FileNotFoundError:
        return HttpResponse("No logs available")


@user_passes_test(lambda u: u.is_superuser)
def request_logfile_timestamp(request) -> HttpResponse:
    """
    Returns the contents of the log file specified by the handler_name GET parameter.
    A logged in superuser is required.
    """
    if request.method != 'GET':
        return HttpResponseBadRequest(REQUEST_METHOD_NOT_ALLOWED_TEXT)
    handler_name = request.GET.get('handler_name', None)
    if handler_name is None:
        return HttpResponseBadRequest(HANDLER_NAME_NOT_PROVIDED_TEXT)
    filename = settings.LOGGING['handlers'][handler_name]['filename']
    try:
        ti_m = os.path.getmtime(filename)
        return JsonResponse({"timestamp": f"{ti_m}"})
    except FileNotFoundError:
        return HttpResponse("No logs available")


@user_passes_test(lambda u: u.is_superuser)
def clear_logfile(request) -> HttpResponse:
    """
    Clears the contents of the log file specified by the handler_name GET parameter.
    A logged in superuser is required.
    """
    if request.method != 'DELETE':
        return HttpResponseBadRequest(REQUEST_METHOD_NOT_ALLOWED_TEXT)
    handler_name = request.GET.get('handler_name', None)
    if handler_name is None:
        return HttpResponseBadRequest(HANDLER_NAME_NOT_PROVIDED_TEXT)
    filename = settings.LOGGING['handlers'][handler_name]['filename']
    try:
        with open(filename, 'w') as f:
            f.write("")
            return HttpResponse(f"Log file {filename} cleared")
    except FileNotFoundError:
        return HttpResponse("No logs available")


@user_passes_test(lambda u: u.is_superuser)
def request_logfile_paths(request) -> JsonResponse | HttpResponseBadRequest:
    """
    Returns a JSON object containing the paths of all log files.
    A logged in superuser is required.
    """
    if request.method != 'GET':
        return HttpResponseBadRequest(REQUEST_METHOD_NOT_ALLOWED_TEXT)

    paths = {handler_name: settings.LOGGING['handlers'][handler_name]['filename']
             for handler_name in settings.LOGGING['handlers']}
    return JsonResponse(paths)


@user_passes_test(lambda u: u.is_superuser)
def view_logfiles(request) -> HttpResponse:
    """
    Returns the log viewer page.
    A logged in superuser is required.
    """
    csrf_token = get_token(request)
    if request.method != 'GET':
        return HttpResponseBadRequest(REQUEST_METHOD_NOT_ALLOWED_TEXT)
    template = loader.get_template("log-lens.html")
    return HttpResponse(template.render({"csrf_token": csrf_token}, request))
