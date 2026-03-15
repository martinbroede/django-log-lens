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

        url = reverse('log-lens:request-logfile-paths')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 302, "View should redirect to login page.")

        url = reverse('log-lens:request-logfile')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 302, "View should redirect to login page.")

        url = reverse('log-lens:request-logfile-timestamp')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 302, "View should redirect to login page.")

        url = reverse('log-lens:clear')
        response = self.client.delete(url)
        self.assertEqual(response.status_code, 302, "View should redirect to login page.")

        url = reverse('log-lens:logout')
        response = self.client.post(url)
        self.assertEqual(response.status_code, 302, "View should redirect to login page.")

    def test_logfile_path_request(self):
        url = reverse('log-lens:request-logfile-paths')
        self.client.force_login(self.regular_user)
        response = self.client.get(url)
        self.assertEqual(response.status_code, 302, "View should reject non-superusers.")

        self.client.force_login(self.superuser)
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200, "View should return 200 OK.")

        dict_response = response.json()
        for val in dict_response.values():
            self.assertTrue(os.path.exists(val), "All log files should exist.")

        handler_names = ['client', 'django', 'requests', 'misc']
        recognized_handlers = dict_response.keys()
        for handler in handler_names:
            self.assertTrue(handler in recognized_handlers, f"Handler {handler} should be recognized.")
        assert len(handler_names) == len(recognized_handlers), "All handlers should be recognized."

    def test_logfile_timestamp_request(self):
        url = reverse('log-lens:request-logfile-timestamp')
        self.client.force_login(self.regular_user)
        response = self.client.get(url)
        self.assertEqual(response.status_code, 302, "View should reject non-superusers.")

        self.client.force_login(self.superuser)
        response = self.client.get(url + "?handler_name=client")
        self.assertEqual(response.status_code, 200, "View should return 200 OK.")

        dict_response = response.json()
        for val in dict_response.values():
            self.assertTrue(isinstance(float(val), float), "Can't convert timestamp to float.")

    def test_logfile_request(self):
        url = reverse('log-lens:request-logfile')
        self.client.force_login(self.regular_user)
        response = self.client.get(url)
        self.assertEqual(response.status_code, 302, "View should reject non-superusers.")

        url = reverse("log-lens:post-log")
        log_message = "This is a test log message."
        severity = "INFO"
        data = {"log_message": log_message, "severity": severity}
        response = self.client.post(url, data, content_type='application/json')
        self.assertEqual(response.status_code, 200, "View should return 200 OK.")

        url = reverse('log-lens:request-logfile')
        self.client.force_login(self.superuser)
        response = self.client.get(url + "?handler_name=client")
        content = response.content.decode('utf-8')
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
        logger = logging.getLogger("django.request")
        logger.debug("DEBUG")
        logger.info("INFO")
        logger.warning("WARNING")
        logger.error("ERROR")
        logger.critical("CRITICAL")

        log_file_content = self.read_log_file("requests")

        for msg in ["WARNING", "ERROR", "CRITICAL"]:
            self.assertTrue(msg in log_file_content, f"Log message {msg} should be found in file.")
        # log level is WARNING::
        for msg in ["DEBUG", "INFO"]:
            self.assertFalse(msg in log_file_content, f"Log message {msg} should not be found in file.")

    def test_login_view(self):
        """
        Tests all branches of the login_view function.
        """
        url = reverse('log-lens:login')

        # GET request - should render login page
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200, "GET request should return 200 OK.")
        self.assertTemplateUsed(response, 'log-lens-login.html', "Should render login template.")
        self.assertNotIn('error_message', response.context, "GET request should not have error message.")

        # POST with valid superuser credentials - should redirect to view
        response = self.client.post(url, {'username': 'admin', 'password': 'admin'})
        self.assertEqual(response.status_code, 302, "Valid superuser should redirect.")
        self.assertEqual(response.url, reverse('log-lens:view'), "Should redirect to log-lens:view.")  # type: ignore
        # Verify user is logged in
        self.assertTrue(response.wsgi_request.user.is_authenticated, "User should be authenticated.")
        self.assertTrue(response.wsgi_request.user.is_superuser, "User should be superuser.")

        # POST with valid non-superuser credentials - should render error message
        response = self.client.post(url, {'username': 'user', 'password': 'user'})
        self.assertEqual(response.status_code, 200, "Non-superuser should not redirect.")
        self.assertTemplateUsed(response, 'log-lens-login.html', "Should render login template.")
        self.assertIn('error_message', response.context, "Should have error message in context.")
        self.assertIn('is not a superuser', response.context['error_message'],
                      "Error message should indicate user is not superuser.")

        # POST with invalid credentials - should render error message
        response = self.client.post(url, {'username': 'invalid_user', 'password': 'invalid_pass'})
        self.assertEqual(response.status_code, 200, "Invalid credentials should not redirect.")
        self.assertTemplateUsed(response, 'log-lens-login.html', "Should render login template.")
        self.assertIn('error_message', response.context, "Should have error message in context.")
        self.assertIn('Invalid credentials', response.context['error_message'],
                      "Error message should indicate invalid credentials.")

    @classmethod
    def tearDownClass(cls):
        """
        Cleans up the log files after each test.
        """
        log_dir = settings.LOG_FOLDER
        for file in os.listdir(log_dir):
            with open(os.path.join(log_dir, file), 'w') as f:
                f.write("")
