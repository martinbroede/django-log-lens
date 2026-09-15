import builtins
import logging
import os
import queue
import shutil
import tempfile
from unittest import mock
from urllib.parse import quote

from django.conf import settings
from django.contrib.auth.models import User
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse

from django_log_lens import event_stream
from django_log_lens.filewatcher import FileWatcher
from django_log_lens.views import MISCONFIGURATION, MSG_NO_LOG_DATA

MISSING_LOG_FOLDER = settings.LOG_FOLDER / "folder-that-does-not-exist"
MISSING_LOG_FILE = str(MISSING_LOG_FOLDER / "app.log")

# A logging config whose only log file lives in a folder that was never created. "delay"
# keeps the handler from creating file or folder, so the file stays missing for real.
LOGGING_WITH_MISSING_FILE = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "never-written": {
            "class": "logging.FileHandler",
            "filename": MISSING_LOG_FILE,
            "delay": True,
        },
    },
    "loggers": {},
}


class LogLensTestCase(TestCase):
    """
    Base class providing the two users every view is checked against and the cleanup of
    the log files the tests write to.
    """

    def setUp(self):
        self.superuser = User.objects.create_superuser('admin', "", 'admin')
        self.regular_user = User.objects.create_user('user', "", 'user')

    @classmethod
    def tearDownClass(cls):
        """
        Cleans up the log files after each test.
        """

        log_dir = settings.LOG_FOLDER
        shutil.rmtree(os.path.join(log_dir, "archive"), ignore_errors=True)
        shutil.rmtree(MISSING_LOG_FOLDER, ignore_errors=True)
        for file in os.listdir(log_dir):
            with open(os.path.join(log_dir, file), 'w') as f:
                f.write("")
        super().tearDownClass()


class TestLogLens(LogLensTestCase):

    def test_anonymous_requests(self):
        """
        Tests if all protected views reject anonymous users.
        """

        url = reverse('log-lens:view')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 302, "View should redirect to login page.")

        url = reverse('log-lens:log-file-api', args=["some/path"])
        response = self.client.delete(url)
        self.assertEqual(response.status_code, 302, "View should redirect to login page.")

        url = reverse('log-lens:logout')
        response = self.client.post(url)
        self.assertEqual(response.status_code, 302, "View should redirect to login page.")

        url = reverse('log-lens:search-api')
        response = self.client.get(url, {"q": "anything"})
        self.assertEqual(response.status_code, 302, "View should redirect to login page.")

        url = reverse('log-lens:archive-api')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 302, "View should redirect to login page.")

    def test_log_post_and_get(self):
        """
        Tests posting log messages and retrieving them via the log file API.
        """

        LOG_FILE_API_NAME = 'log-lens:log-file-api'
        PATH_TO_LOG_FILE = settings.LOGGING['handlers']['clients']['filename']
        url = reverse(LOG_FILE_API_NAME, args=[PATH_TO_LOG_FILE])
        self.client.force_login(self.regular_user)
        response = self.client.get(url)
        self.assertEqual(response.status_code, 302, "View should reject non-superusers.")

        LOG_API_NAME = 'log-lens:log-api'
        url = reverse(LOG_API_NAME)
        log_message = "This is a test log message."
        severity = "INFO"
        data = {"log_message": log_message, "severity": severity}
        response = self.client.post(url, data, content_type='application/json')
        self.assertEqual(response.status_code, 200, "View should return 200 OK.")

        url = reverse(LOG_FILE_API_NAME, args=[PATH_TO_LOG_FILE])
        self.client.force_login(self.superuser)
        response = self.client.get(url + "?handler_name=client")
        content = response.streaming_content.__next__().decode("utf-8")  # type: ignore
        self.assertEqual(response.status_code, 200, "View should return 200 OK.")
        self.assertTrue(log_message in content, "Log message should be in response.")
        self.assertTrue(severity in content, "Severity must be found in response.")

    def read_log_file(self, handler_name):
        """
        Reads log data associated with the given handler name.
        """

        with open(settings.LOGGING['handlers'][handler_name]['filename'], 'r') as f:
            return f.read()

    def test_log_levels(self):
        """
        Tests if log messages are recorded according to their severity levels.
        """

        logger = logging.getLogger("django")
        logger.debug("DEBUG")
        logger.info("INFO")
        logger.warning("WARNING")
        logger.error("ERROR")
        logger.critical("CRITICAL")

        log_file_content = self.read_log_file("django")

        for msg in ["WARNING", "ERROR", "CRITICAL"]:
            self.assertTrue(msg in log_file_content, f"Log message {msg} should be found in file.")
        # log level is WARNING::
        for msg in ["DEBUG", "INFO"]:
            self.assertFalse(msg in log_file_content, f"Log message {msg} should not be found in file.")

    def test_search_all_sources(self):
        """
        Tests the global search across all log sources.
        """

        needle = "a-very-unique-needle-to-search-for"
        logging.getLogger("django").error(needle)

        url = reverse('log-lens:search-api')

        self.client.force_login(self.regular_user)
        response = self.client.get(url, {"q": needle})
        self.assertEqual(response.status_code, 302, "View should reject non-superusers.")

        self.client.force_login(self.superuser)
        response = self.client.get(url, {"q": needle})
        self.assertEqual(response.status_code, 200, "View should return 200 OK.")

        data = response.json()
        self.assertEqual(data["total_matches"], 1, "The needle should be found exactly once.")
        self.assertGreater(data["sources_searched"], 0, "At least one source should be searched.")

        source, line_number, text = (
            data["results"][0]["source"],
            data["results"][0]["matches"][0][0],
            data["results"][0]["matches"][0][1],
        )
        self.assertEqual(source, settings.LOGGING['handlers']['django']['filename'])
        self.assertGreater(line_number, 0, "Line numbers are 1-based.")
        self.assertIn(needle, text, "The matching line should contain the needle.")

    def test_search_is_case_insensitive_by_default(self):
        """
        Tests that the global search only respects casing when asked to.
        """

        logging.getLogger("django").error("MiXeDcAsEnEeDlE")
        url = reverse('log-lens:search-api')
        self.client.force_login(self.superuser)

        response = self.client.get(url, {"q": "mixedcaseneedle"})
        self.assertEqual(response.json()["total_matches"], 1, "Search should ignore casing by default.")

        response = self.client.get(url, {"q": "mixedcaseneedle", "case_sensitive": "true"})
        self.assertEqual(response.json()["total_matches"], 0, "Case-sensitive search should not match.")

        response = self.client.get(url, {"q": "MiXeDcAsEnEeDlE", "case_sensitive": "true"})
        self.assertEqual(response.json()["total_matches"], 1, "Case-sensitive search should match exactly.")

    def test_search_rejects_invalid_terms(self):
        """
        Tests that the global search rejects missing and oversized search terms.
        """

        url = reverse('log-lens:search-api')
        self.client.force_login(self.superuser)

        for term in ["", "   ", "x" * 201]:
            response = self.client.get(url, {"q": term})
            self.assertEqual(response.status_code, 400, f"Search should reject the term {term!r}.")

        response = self.client.get(url)
        self.assertEqual(response.status_code, 400, "Search should reject a missing term.")

    def test_archive_round_trip(self):
        """
        Tests archiving a log source, listing, reading and deleting the archived copy.
        """

        needle = "a-log-line-that-is-meant-to-be-archived"
        logging.getLogger("django").error(needle)
        source = settings.LOGGING['handlers']['django']['filename']
        url = reverse('log-lens:archive-api')

        self.client.force_login(self.regular_user)
        response = self.client.post(url, {"source": source}, content_type='application/json')
        self.assertEqual(response.status_code, 302, "View should reject non-superusers.")

        self.client.force_login(self.superuser)
        response = self.client.post(url, {"source": source}, content_type='application/json')
        self.assertEqual(response.status_code, 200, "View should return 200 OK.")

        archived_source = response.json()["source"]
        self.assertTrue(os.path.isfile(archived_source), "The archived copy should exist.")
        self.assertEqual(
            os.path.dirname(archived_source),
            os.path.join(str(settings.LOG_FOLDER), "archive"),
            "The copy should be archived in the 'archive' folder next to the log file.",
        )
        with open(archived_source, 'r') as f:
            self.assertIn(needle, f.read(), "The archived copy should hold the log data.")

        response = self.client.get(url)
        entries = response.json()["entries"]
        self.assertIn(archived_source, [entry["source"] for entry in entries],
                      "The archived copy should be listed.")

        response = self.client.get(reverse('log-lens:log-file-api', args=[archived_source]))
        self.assertEqual(response.status_code, 200, "An archived file should be readable.")
        content = response.streaming_content.__next__().decode("utf-8")  # type: ignore
        self.assertIn(needle, content, "The archived file should be served with its content.")

        response = self.client.delete(reverse('log-lens:log-file-api', args=[archived_source]))
        self.assertEqual(response.status_code, 400, "An archived file must not be cleared.")

        response = self.client.delete(f"{url}?source={quote(archived_source)}")
        self.assertEqual(response.status_code, 200, "View should return 200 OK.")
        self.assertFalse(os.path.exists(archived_source), "The archived copy should be gone.")
        self.assertNotIn(archived_source, [entry["source"] for entry in response.json()["entries"]],
                         "The deleted copy should no longer be listed.")

    def test_archive_does_not_overwrite_previous_copies(self):
        """
        Tests that archiving the same log source twice keeps both copies.
        """

        source = settings.LOGGING['handlers']['django']['filename']
        url = reverse('log-lens:archive-api')
        self.client.force_login(self.superuser)

        first = self.client.post(url, {"source": source}, content_type='application/json').json()
        second = self.client.post(url, {"source": source}, content_type='application/json').json()

        self.assertNotEqual(first["source"], second["source"], "Each copy needs its own name.")
        self.assertTrue(os.path.isfile(first["source"]), "The first copy should still exist.")
        self.assertTrue(os.path.isfile(second["source"]), "The second copy should exist.")

    def test_archive_delete_all(self):
        """
        Tests that "delete all" in the archive tab removes every archived file and nothing else.
        """

        url = reverse('log-lens:archive-api')
        self.client.force_login(self.superuser)

        sources = [settings.LOGGING['handlers'][handler]['filename'] for handler in ("django", "clients")]
        archived = [
            self.client.post(url, {"source": source}, content_type='application/json').json()["source"]
            for source in sources
        ]

        response = self.client.delete(f"{url}?all=true")
        self.assertEqual(response.status_code, 200, "View should return 200 OK.")
        self.assertCountEqual(response.json()["deleted"], archived, "Every copy should be reported.")
        self.assertEqual(response.json()["entries"], [], "No archived file should be left.")

        for archived_source in archived:
            self.assertFalse(os.path.exists(archived_source), "The archived copy should be gone.")
        for source in sources:
            self.assertTrue(os.path.isfile(source), "The log file itself must not be deleted.")

    def test_archive_rejects_unknown_sources(self):
        """
        Tests that only log sources known from settings.LOGGING can be archived and that
        only known archived files can be deleted.
        """

        url = reverse('log-lens:archive-api')
        self.client.force_login(self.superuser)

        for source in ["/etc/passwd", "../../etc/passwd", str(settings.LOG_FOLDER), ""]:
            response = self.client.post(url, {"source": source}, content_type='application/json')
            self.assertEqual(response.status_code, 400, f"Archiving {source!r} should be rejected.")
            response = self.client.delete(f"{url}?source={quote(source)}")
            self.assertEqual(response.status_code, 400, f"Deleting {source!r} should be rejected.")

        response = self.client.post(url, {"no-source": "at all"}, content_type='application/json')
        self.assertEqual(response.status_code, 400, "An invalid payload should be rejected.")

        response = self.client.delete(url)
        self.assertEqual(response.status_code, 400, "A missing source should be rejected.")

    def test_archived_files_are_excluded_from_search(self):
        """
        Tests that a needle is not reported twice once its log source has been archived.
        """

        needle = "a-needle-that-must-not-be-found-twice"
        logging.getLogger("django").error(needle)
        source = settings.LOGGING['handlers']['django']['filename']

        self.client.force_login(self.superuser)
        self.client.post(reverse('log-lens:archive-api'),
                         {"source": source}, content_type='application/json')

        response = self.client.get(reverse('log-lens:search-api'), {"q": needle})
        self.assertEqual(response.json()["total_matches"], 1,
                         "Archived files should not be searched.")


class TestAuthentication(LogLensTestCase):
    """
    Tests the login/logout views, i.e. the only way into the log viewer.
    """

    def test_login_page_is_public(self):
        """
        Tests that the login page itself is reachable without being logged in.
        """

        response = self.client.get(reverse('log-lens:login'))
        self.assertEqual(response.status_code, 200, "The login page should be public.")

    def test_login_rejects_invalid_credentials(self):
        """
        Tests that wrong credentials neither log the user in nor leak whether the user exists.
        """

        response = self.client.post(reverse('log-lens:login'),
                                    {"username": "admin", "password": "not-the-password"})
        self.assertEqual(response.status_code, 200, "The login page should be shown again.")
        self.assertContains(response, "Invalid credentials")

        response = self.client.get(reverse('log-lens:view'))
        self.assertEqual(response.status_code, 302, "The user must not be logged in.")

    def test_login_rejects_non_superusers(self):
        """
        Tests that valid credentials of a non-superuser do not grant access.
        """

        response = self.client.post(reverse('log-lens:login'),
                                    {"username": "user", "password": "user"})
        self.assertEqual(response.status_code, 200, "The login page should be shown again.")
        self.assertContains(response, "user is not a superuser")

        response = self.client.get(reverse('log-lens:view'))
        self.assertEqual(response.status_code, 302, "The user must not be logged in.")

    def test_login_and_logout_round_trip(self):
        """
        Tests that a superuser can log in, reach the viewer and log out again.
        """

        login_url, view_url = reverse('log-lens:login'), reverse('log-lens:view')

        response = self.client.post(login_url, {"username": "admin", "password": "admin"})
        self.assertRedirects(response, view_url, fetch_redirect_response=False)
        self.assertEqual(self.client.get(view_url).status_code, 200,
                         "A logged in superuser should reach the viewer.")

        response = self.client.post(reverse('log-lens:logout'))
        self.assertRedirects(response, login_url, fetch_redirect_response=False)
        self.assertEqual(self.client.get(view_url).status_code, 302,
                         "After logging out the viewer should be out of reach again.")

    def test_logout_of_an_anonymous_session(self):
        """
        Tests that logging out without being logged in is a no-op rather than an error.
        """

        response = self.client.post(reverse('log-lens:logout'))
        self.assertRedirects(response, reverse('log-lens:login'), fetch_redirect_response=False)


class TestLogViewerPage(LogLensTestCase):
    """
    Tests the log viewer page itself.
    """

    def test_viewer_lists_the_configured_log_sources(self):
        """
        Tests that the viewer renders and offers every log file from settings.LOGGING.
        """

        self.client.force_login(self.superuser)
        response = self.client.get(reverse('log-lens:view'))

        self.assertEqual(response.status_code, 200, "View should return 200 OK.")
        self.assertTemplateUsed(response, 'log_lens/view.html')
        for handler_name in ("django", "clients", "audits", "resources"):
            file_name = os.path.basename(settings.LOGGING['handlers'][handler_name]['filename'])
            self.assertContains(response, file_name)
        self.assertNotContains(response, MISCONFIGURATION)


class TestClientLogging(LogLensTestCase):
    """
    Tests the endpoint the frontend's logger.js forwards console calls to.
    """

    def test_client_logging_can_be_disabled(self):
        """
        Tests that ALLOW_JS_LOGGING is re-checked per request, not only when the URL is registered.
        """

        with override_settings(ALLOW_JS_LOGGING=False):
            response = self.client.post(reverse('log-lens:log-api'),
                                        {"log_message": "nope", "severity": "INFO"},
                                        content_type='application/json')
        self.assertEqual(response.status_code, 403, "Client logging should be refused when disabled.")

    def test_client_logging_rejects_invalid_payloads(self):
        """
        Tests that a malformed body is rejected instead of raising.
        """

        url = reverse('log-lens:log-api')
        for payload in ['not json at all', '{"log_message": "no severity"}', '{"severity": "INFO"}']:
            response = self.client.post(url, payload, content_type='application/json')
            self.assertEqual(response.status_code, 400, f"Payload {payload!r} should be rejected.")


class TestLogFileApi(LogLensTestCase):
    """
    Tests reading and clearing log files, i.e. the app's main security boundary.
    """

    SOURCE_HANDLER = "resources"  # nothing else logs to this file during the tests

    def setUp(self):
        super().setUp()
        self.source = settings.LOGGING['handlers'][self.SOURCE_HANDLER]['filename']
        self.url = reverse('log-lens:log-file-api', args=[self.source])
        self.client.force_login(self.superuser)
        with open(self.source, 'w'):  # start from a known, empty log file
            pass

    def read_stream(self, response) -> str:
        """
        Consumes the whole streaming response, not just its first chunk.
        """

        return b"".join(response.streaming_content).decode("utf-8")

    def test_reading_from_a_line_offset(self):
        """
        Tests that the "from" parameter skips the lines the frontend already holds.
        """

        logger = logging.getLogger(self.SOURCE_HANDLER)
        for line in ("first-line", "second-line", "third-line"):
            logger.error(line)

        content = self.read_stream(self.client.get(self.url, {"from": 2}))
        self.assertNotIn("first-line", content, "Lines before the offset should be skipped.")
        self.assertIn("second-line", content, "The offset line itself should be included.")
        self.assertIn("third-line", content, "Everything after the offset should be included.")

    def test_reading_a_file_larger_than_one_chunk(self):
        """
        Tests that a log file is served completely rather than one 8 KB chunk.
        """

        logger = logging.getLogger(self.SOURCE_HANDLER)
        for index in range(500):
            logger.error(f"line-number-{index}")

        content = self.read_stream(self.client.get(self.url))
        self.assertGreater(len(content), 8192, "The test needs a file spanning several chunks.")
        self.assertIn("line-number-499", content, "The last line should be served as well.")

    def tracked_open(self):
        """
        Patches the open() used for streaming and collects the file objects it hands out,
        so that a test can assert they are closed again.
        """

        opened = []

        def remember(*args, **kwargs):
            opened.append(builtins.open(*args, **kwargs))
            return opened[-1]

        return mock.patch("django_log_lens.views.open", remember, create=True), opened

    def test_an_aborted_download_closes_the_log_file(self):
        """
        Tests that a client disconnecting half way through does not leak the open log file.
        """

        logging.getLogger(self.SOURCE_HANDLER).error("a-line-nobody-reads-to-the-end")
        patcher, opened = self.tracked_open()

        with patcher:
            response = self.client.get(self.url)
            next(response.streaming_content)  # the client reads the first chunk ...
            self.assertEqual(len(opened), 1, "The log file should be open while streaming.")
            self.assertFalse(opened[0].closed, "The log file should be open while streaming.")
            response.close()  # ... and then goes away

        self.assertTrue(opened[0].closed, "An aborted stream should close the log file.")

    def test_a_response_that_is_never_read_opens_nothing(self):
        """
        Tests that the log file is only opened once the response is actually streamed, so a
        response that is discarded before that leaves no descriptor behind.
        """

        logging.getLogger(self.SOURCE_HANDLER).error("a-line-nobody-reads-at-all")
        patcher, opened = self.tracked_open()

        with patcher:
            self.client.get(self.url).close()

        self.assertEqual(opened, [], "An unread response should not have opened the log file.")

    def test_rejects_paths_outside_the_logging_config(self):
        """
        Tests that only files belonging to a recognized handler can be read or cleared.
        """

        for path in ["/etc/passwd", "../../etc/passwd", str(settings.LOG_FOLDER)]:
            url = reverse('log-lens:log-file-api', args=[path])
            self.assertEqual(self.client.get(url).status_code, 400, f"Reading {path!r} should be rejected.")
            self.assertEqual(self.client.delete(url).status_code, 400, f"Clearing {path!r} should be rejected.")

    def test_rejects_an_invalid_line_offset(self):
        """
        Tests that a non-numeric "from" parameter is rejected instead of raising.
        """

        self.assertEqual(self.client.get(self.url, {"from": "not-a-number"}).status_code, 400)

    def test_misconfiguration_placeholder_is_echoed(self):
        """
        Tests the placeholder source the frontend asks for when settings.LOGGING is unusable.
        """

        url = reverse('log-lens:log-file-api', args=[MISCONFIGURATION])
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200, "View should return 200 OK.")
        self.assertEqual(response.content.decode("utf-8"), MISCONFIGURATION)

    def test_clearing_a_log_file(self):
        """
        Tests that clearing empties the log file instead of removing it.
        """

        logging.getLogger(self.SOURCE_HANDLER).error("a-line-that-is-about-to-be-cleared")

        response = self.client.delete(self.url)
        self.assertEqual(response.status_code, 204, "View should return 204 No Content.")
        self.assertTrue(os.path.isfile(self.source), "The log file itself should still exist.")
        self.assertEqual(os.path.getsize(self.source), 0, "The log file should be empty.")

    @override_settings(LOGGING=LOGGING_WITH_MISSING_FILE)
    def test_a_configured_but_missing_log_file_reports_no_data(self):
        """
        Tests a handler that has not written anything yet (its log folder does not even
        exist): it counts as a valid source, but reading it yields the no-data message
        rather than an error.
        """

        self.assertFalse(os.path.exists(MISSING_LOG_FILE), "The test needs the file to be missing.")

        response = self.client.get(reverse('log-lens:view'))
        self.assertEqual(response.status_code, 200, "The viewer should render regardless.")
        self.assertContains(response, os.path.basename(MISSING_LOG_FILE))

        response = self.client.get(reverse('log-lens:log-file-api', args=[MISSING_LOG_FILE]))
        self.assertEqual(response.status_code, 200, "View should return 200 OK.")
        self.assertEqual(self.read_stream(response), MSG_NO_LOG_DATA)


class TestEventStream(LogLensTestCase):
    """
    Tests the Server-Sent Events endpoint the frontend keeps open for auto-refresh.
    """

    def tearDown(self):
        for subscription in list(event_stream._subscribers):
            event_stream.remove_sse_subscription(subscription)

    def test_stream_endpoint_requires_a_superuser(self):
        """
        Tests that only a superuser gets a stream, and that the connection is registered.
        """

        url = reverse('log-lens:stream-api')

        self.client.force_login(self.regular_user)
        self.assertEqual(self.client.get(url).status_code, 302, "View should reject non-superusers.")

        subscribers_before = set(event_stream._subscribers)
        self.client.force_login(self.superuser)
        response = self.client.get(url)

        self.assertEqual(response.status_code, 200, "View should return 200 OK.")
        self.assertEqual(response["Content-Type"], "text/event-stream")
        self.assertEqual(response["Cache-Control"], "no-cache")
        self.assertEqual(len(set(event_stream._subscribers) - subscribers_before), 1,
                         "The open connection should be registered as a subscriber.")

    def test_file_changes_are_streamed_as_sse_messages(self):
        """
        Tests the wire format the frontend parses: one JSON object per SSE message.
        """

        subscription = event_stream.get_sse_subscription()
        event_stream.add_file_change_to_queue("/var/log/app.log", "rotate")

        queued = subscription.qsize()  # other watchers may have queued messages, too
        stream = event_stream.stream_queue(subscription)
        messages = [next(stream) for _ in range(queued)]

        self.assertIn(b'data: {"source": "/var/log/app.log", "action": "rotate"}\n\n', messages)

        stream.close()  # the client disconnects
        self.assertNotIn(subscription, event_stream._subscribers,
                         "A disconnected client should be unsubscribed.")

    def test_stream_of_an_unsubscribed_client_ends(self):
        """
        Tests that a removed subscription stops its stream instead of blocking forever.
        """

        subscription = event_stream.get_sse_subscription()
        event_stream.remove_sse_subscription(subscription)
        self.assertEqual(list(event_stream.stream_queue(subscription)), [])

    def test_a_client_that_stops_reading_is_dropped(self):
        """
        Tests that a full queue drops the subscriber rather than stalling the file watchers.
        """

        subscription = queue.Queue(maxsize=1)
        with event_stream._sub_lock:
            event_stream._subscribers.add(subscription)

        event_stream.add_file_change_to_queue("/var/log/app.log", "append")  # fills the queue
        event_stream.add_file_change_to_queue("/var/log/app.log", "append")  # does not fit

        self.assertNotIn(subscription, event_stream._subscribers,
                         "A subscriber that stopped reading should be dropped.")


class TestFileWatcher(SimpleTestCase):
    """
    Tests the polling file watcher that feeds the event stream.
    """

    def test_watcher_reports_appends_rotations_and_missing_files(self):
        """
        Tests that a growing file is reported as "append", a shrinking one as "rotate" and
        a missing one not at all.
        """

        events = []
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "watched.log")

            # the polling thread is not needed here -- the polls are driven by hand so that
            # the test does not depend on timing
            with mock.patch("django_log_lens.filewatcher.threading.Thread"):
                watcher = FileWatcher(filepath=path, interval=1.0,
                                      callback=lambda *event: events.append(event))

            watcher._poll_once()  # the file does not exist yet
            self.assertEqual(events, [], "A missing file should not be reported as a change.")

            self.write(path, "first\n", mtime=1000)
            watcher._poll_once()
            self.assertEqual(events, [], "The first sighting is the baseline, not a change.")

            self.write(path, "first\nsecond\n", mtime=2000)
            watcher._poll_once()
            self.assertEqual(events, [(path, "append")], "A grown file should be an append.")

            self.write(path, "", mtime=3000)
            watcher._poll_once()
            self.assertEqual(events[-1], (path, "rotate"), "A shrunk file should be a rotation.")

            os.remove(path)
            watcher._poll_once()
            self.assertEqual(len(events), 2, "A file that vanished should not be reported.")

    def write(self, path: str, content: str, mtime: int) -> None:
        """
        Writes the file and stamps it with an explicit modification time, so that the
        watcher sees a change regardless of the file system's mtime resolution.
        """

        with open(path, "w") as file:
            file.write(content)
        os.utime(path, (mtime, mtime))
