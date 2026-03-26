import logging
import random
from threading import Thread
from time import sleep

instances = [f"{random.randint(0, 0xFFFFFFFF):08x}" for _ in range(10)]
logger = logging.getLogger("resources")
resource_events = [
    lambda: logger.info(
        f"[instance:{random.choice(instances)}] CPU usage at {random.randint(20, 95)}% (1m avg: {random.randint(20, 90)}%, 5m avg: {random.randint(20, 85)}%)"),  # noqa: E501
    lambda: logger.info(
        f"[instance:{random.choice(instances)}] Memory usage at {random.randint(30, 90)}% (accessible: 16GB)"),  # noqa: E501
    lambda: logger.info(
        f"[instance:{random.choice(instances)}] Disk I/O read={random.randint(10, 100)}MB/s write={random.randint(5, 50)}MB/s"),  # noqa: E501
    lambda: logger.info(
        f"[instance:{random.choice(instances)}] Network throughput inbound={random.randint(50, 200)}Mbps outbound={random.randint(40, 150)}Mbps"),  # noqa: E501
    lambda: logger.warning(
        f"[instance:{random.choice(instances)}] CPU spike detected (current={random.randint(85, 100)}%, threshold=85%)"),  # noqa: E501
    lambda: logger.info(
        f"[instance:{random.choice(instances)}] GC completed in {random.randint(50, 200)}ms (heap used after GC: {random.uniform(0.5, 3.0):.1f}GB)"),  # noqa: E501
    lambda: logger.info(
        f"[instance:{random.choice(instances)}] Process runtime metrics collected {{threads={random.randint(50, 200)}, open_fds={random.randint(100, 300)}}}"),  # noqa: E501
    lambda: logger.info(
        f"[instance:{random.choice(instances)}] Response time p95={random.randint(100, 300)}ms p99={random.randint(200, 500)}ms"),  # noqa: E501
    lambda: logger.warning(
        f"[instance:{random.choice(instances)}] Memory pressure high (available: {random.randint(100, 800)}MB)"),  # noqa: E501
    lambda: logger.info(
        f"[instance:{random.choice(instances)}] Load average {{1m={random.uniform(0.5, 3.0):.2f}, 5m={random.uniform(0.5, 3.0):.2f}, 15m={random.uniform(0.5, 3.0):.2f}}}"),  # noqa: E501
    lambda: logger.error(
        f"[instance:{random.choice(instances)}] Forced closing of {random.randint(1, 11)} connections due to resource limits"),  # noqa: E501
    lambda: logger.info(
        f"[instance:{random.choice(instances)}] Cache hit ratio at {random.randint(70, 99)}% (hits: {random.randint(1000, 9999)}, misses: {random.randint(10, 500)})"),  # noqa: E501
    lambda: logger.warning(
        f"[instance:{random.choice(instances)}] Disk usage critical (used: {random.randint(85, 98)}%, threshold=85%)"),  # noqa: E501
    lambda: logger.info(
        f"[instance:{random.choice(instances)}] Database connection pool {{active={random.randint(10, 50)}, idle={random.randint(5, 30)}, max=100}}"),  # noqa: E501
    lambda: logger.info(
        f"[instance:{random.choice(instances)}] Request queue depth at {random.randint(5, 100)} (avg wait time: {random.randint(10, 200)}ms)"),  # noqa: E501
    lambda: logger.warning(
        f"[instance:{random.choice(instances)}] Thread pool exhaustion detected (active: {random.randint(95, 100)}/100)"),  # noqa: E501
    lambda: logger.error(
        f"[instance:{random.choice(instances)}] Instance out of memory, terminating threads to recover"),  # noqa: E501
    lambda: logger.info(
        f"[instance:{random.choice(instances)}] Swap usage at {random.randint(0, 40)}% (total: 8GB)"),  # noqa: E501
    lambda: logger.info(
        f"[instance:{random.choice(instances)}] HTTP connections {{active={random.randint(100, 500)}, keepalive={random.randint(50, 300)}}}"),  # noqa: E501
    lambda: logger.info(
        f"[instance:{random.choice(instances)}] Disk queue length at {random.randint(1, 20)} (latency: {random.randint(1, 50)}ms)")  # noqa: E501
]


def produce_logs():
    thread = Thread(target=_produce_resource_logs_thread, daemon=True)
    thread.start()


def _produce_resource_logs_thread():
    while True:
        event = random.choice(resource_events)
        event()
        event = random.choice(resource_events)
        event()
        sleep(random.uniform(0.0, 3))
