from django.urls import path

from . import views

urlpatterns = [
    path('auth/register', views.register),
    path('auth/login', views.login),
    path('auth/logout', views.logout),
    path('auth/me', views.me),
    path('auth/password/change', views.password_change),
    path('auth/password/forgot', views.password_forgot),
    path('auth/password/reset', views.password_reset),
    path('auth/sessions', views.sessions),
    path('auth/sessions/<str:id>', views.session_revoke),
]
