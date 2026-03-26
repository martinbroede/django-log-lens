import logging
import os

from django.conf import settings
from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse


class TestLogLens(TestCase):

    def setUp(self):
        self.superuser = User.objects.create_superuser('admin', "", 'admin')
        self.regular_user = User.objects.create_user('user', "", 'user')

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

    @classmethod
    def tearDownClass(cls):
        """
        Cleans up the log files after each test.
        """

        log_dir = settings.LOG_FOLDER
        for file in os.listdir(log_dir):
            with open(os.path.join(log_dir, file), 'w') as f:
                f.write("")
