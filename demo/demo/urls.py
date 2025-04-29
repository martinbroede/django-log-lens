from django.shortcuts import render
from django.urls import include, path


def demo_view(request):
    return render(request, 'index.html')


urlpatterns = [
    path('', demo_view),
    path('logs/', include('django_log_lens.urls')),
]
