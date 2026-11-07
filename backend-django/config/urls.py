from django.urls import include, path

# Même préfixe que l'API Node : le site Next.js relaie /api/v1/* sans modification.
urlpatterns = [
    path('api/v1/', include('catalog.urls')),
]
