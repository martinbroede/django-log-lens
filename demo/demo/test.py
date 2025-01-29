import os

from django.conf import settings
from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse


class TestLogLens(TestCase):

    def setUp(self):
        log_dir = settings.LOG_FOLDER
        for file in os.listdir(log_dir):
            with open(os.path.join(log_dir, file), 'w') as f:
                f.write("")

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

        handler_names = ['client', 'django', 'requests']
        for key in dict_response.keys():
            self.assertTrue(key in handler_names, "All handler names should be valid.")

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
