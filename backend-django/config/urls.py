from django.urls import include, path, re_path

from core.legacy_proxy import relay

# Même préfixe que l'API Node : le site Next.js relaie /api/v1/* sans modification.
urlpatterns = [
    path('api/v1/', include('catalog.urls')),
    path('api/v1/', include('accounts.urls')),
    # En dernier : tout ce qui n'est pas encore réécrit part vers l'API Node (LEGACY_API_URL).
    re_path(r'^api/v1/(?P<rest>.+)$', relay),
]
