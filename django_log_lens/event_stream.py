import json
import queue
import threading
from typing import Iterator, Literal

from django.contrib.auth.decorators import user_passes_test
from django.http import StreamingHttpResponse
from django.views.decorators.http import require_http_methods

from .filewatcher import FileWatcher
from .views import MISCONFIGURATION, get_source_mappings

__subscribers: set[queue.Queue] = set()
__sub_lock = threading.Lock()


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
    with __sub_lock:
        __subscribers.add(q)
    return q


def remove_sse_subscription(q: queue.Queue) -> None:
    """
    Removes a queue from the set of SSE subscribers.
    """
    with __sub_lock:
        __subscribers.discard(q)


def notify_sse_subscribers(msg: bytes):
    """
    Notifies all SSE subscribers with the given message.
    Removes any subscribers whose queues are full.
    """
    with __sub_lock:
        dead = []
        for q in __subscribers:
            try:
                q.put_nowait(msg)
            except queue.Full:
                dead.append(q)  # mark subscriber as dead
        for q in dead:
            __subscribers.discard(q)


def stream_queue(queue: queue.Queue) -> Iterator[bytes]:
    """
    Generator function that yields Server-Sent Events (SSE) messages from the queue.
    """
    while True:
        if queue not in __subscribers:
            break
        try:
            data = queue.get().decode("utf-8")
            msg = f'data: {data}\n\n'
            yield msg.encode("utf-8")
        except GeneratorExit:
            remove_sse_subscription(queue)
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
