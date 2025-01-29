from django.shortcuts import render
from django.urls import include, path

from django_log_lens import add_file_handling_class


def demo_view(request):
    return render(request, 'index.html')


urlpatterns = [
    path('', demo_view),
    path('logs/', include('django_log_lens.urls')),
]

add_file_handling_class("demo.handler.CustomFileHandler")
