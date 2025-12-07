import json
import queue
import threading
from typing import Iterator, Literal

from django.contrib.auth.decorators import user_passes_test
from django.http import StreamingHttpResponse
from django.views.decorators.http import require_http_methods

from .filewatcher import FileWatcher
from .views import MISCONFIGURATION, get_source_mappings

msg_queue = queue.Queue(maxsize=100)

subscribers = set()
sub_lock = threading.Lock()


def get_sse_subscription() -> queue.Queue:
    """
    Creates and returns a new queue for a Server-Sent Events (SSE) subscriber.
    """
    q = queue.Queue(maxsize=10)
    with sub_lock:
        subscribers.add(q)
    return q


def remove_sse_subscription(q: queue.Queue) -> None:
    """
    Removes a queue from the set of SSE subscribers.
    """
    with sub_lock:
        subscribers.discard(q)


def notify_sse_subscribers(msg: bytes):
    """
    Notifies all SSE subscribers with the given message.
    Removes any subscribers whose queues are full.
    """
    with sub_lock:
        dead = []
        for q in subscribers:
            try:
                q.put_nowait(msg)
            except queue.Full:
                dead.append(q)  # mark subscriber as dead
        for q in dead:
            subscribers.discard(q)


@require_http_methods(["GET"])
@user_passes_test(lambda user: user.is_superuser, login_url='log-lens:login')
def sse_endpoint(_):
    response = StreamingHttpResponse(
        event_stream(),
        content_type="text/event-stream",
    )
    response["Cache-Control"] = "no-cache"
    return response


def event_stream() -> Iterator[bytes]:
    """
    Generator function that yields Server-Sent Events (SSE) messages from the queue.
    """
    while True:
        data = msg_queue.get()
        msg = f'data: {data}\n\n'
        yield msg.encode("utf-8")


def add_file_change_to_queue(file_path: str, action: Literal["append", "rotate"]):
    """
    Adds a message to the queue, ignoring if the queue is full.
    """
    message_dict = {
        "file_path": file_path,
        "action": action,
    }
    msg = json.dumps(message_dict)
    try:
        msg_queue.put(msg, timeout=0.1)
    except queue.Full:
        pass


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
