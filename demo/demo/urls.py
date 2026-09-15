from django.conf import settings
from django.contrib.staticfiles.views import serve as serve_static
from django.shortcuts import render
from django.urls import include, path
from django.views.decorators.cache import never_cache

from demo.log_producer import produce_logs


def demo_view(request):
    return render(request, 'index.html')


urlpatterns = [
    path('', demo_view),
    path('index', demo_view),
    path('logs/', include('django_log_lens.urls')),
]

if settings.DEBUG or getattr(settings, "LOG_LENS_DEBUG", False):
    urlpatterns += [
        path('static/<path:path>', never_cache(serve_static)),
    ]

produce_logs()
