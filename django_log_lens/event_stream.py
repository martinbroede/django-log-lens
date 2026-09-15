import json
import queue
import threading
from collections.abc import Iterator
from typing import Literal

from django.contrib.auth.decorators import user_passes_test
from django.http import StreamingHttpResponse
from django.views.decorators.http import require_http_methods

from .filewatcher import FileWatcher
from .views import MISCONFIGURATION, get_source_mappings

_subscribers: set[queue.Queue] = set()
_sub_lock = threading.Lock()


@require_http_methods(["GET"])
@user_passes_test(lambda user: user.is_superuser, login_url='log-lens:login')
def sse_endpoint(_):
    """
    Server-Sent Events (SSE) endpoint
    for streaming log file updates to authenticated superusers.
    """
    q = get_sse_subscription()
    response = StreamingHttpResponse(
        stream_queue(q),
        content_type="text/event-stream",
    )
    response["Cache-Control"] = "no-cache"
    return response


def get_sse_subscription() -> queue.Queue:
    """
    Creates and returns a new queue for a Server-Sent Events (SSE) subscriber.
    """
    q = queue.Queue(maxsize=10)
    with _sub_lock:
        _subscribers.add(q)
    return q


def remove_sse_subscription(subscription: queue.Queue) -> None:
    """
    Removes a queue from the set of SSE subscribers.
    """
    with _sub_lock:
        _subscribers.discard(subscription)


def notify_sse_subscribers(msg: bytes):
    """
    Notifies all SSE subscribers with the given message.
    Removes any subscribers whose queues are full.
    """
    with _sub_lock:
        dead = [q for q in _subscribers if not _try_put(q, msg)]
        for q in dead:
            _subscribers.discard(q)


def _try_put(subscription: queue.Queue, msg: bytes) -> bool:
    """
    Attempts a non-blocking put onto the subscription's queue.
    Returns False (marking the subscriber as dead) if the queue is full.
    """
    try:
        subscription.put_nowait(msg)
        return True
    except queue.Full:
        return False


def stream_queue(subscription: queue.Queue) -> Iterator[bytes]:
    """
    Generator function that yields Server-Sent Events (SSE) messages from the queue.
    """
    while True:
        if subscription not in _subscribers:
            break
        try:
            data = subscription.get().decode("utf-8")
            msg = f'data: {data}\n\n'
            yield msg.encode("utf-8")
        except GeneratorExit:
            remove_sse_subscription(subscription)
            break


def add_file_change_to_queue(file_path: str, action: Literal["append", "rotate"]):
    """
    Adds a message to the queue, ignoring if the queue is full.
    """
    message = {"source": file_path, "action": action, }
    notify_sse_subscribers(json.dumps(message).encode("utf-8"))


def init_file_watchers():
    """
    Initializes file watchers for each valid log source.
    """
    for handler_info in get_source_mappings():
        _, file_path, _, _ = handler_info
        if file_path != MISCONFIGURATION:
            FileWatcher(
                filepath=file_path,
                interval=1.0,
                callback=add_file_change_to_queue,
            )


init_file_watchers()
