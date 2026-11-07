from django.urls import path

from . import views

urlpatterns = [
    path('shops', views.shop_list),
    path('shops/<str:slug>', views.shop_detail),
]
