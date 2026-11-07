from django.urls import path

from . import views

urlpatterns = [
    path('me/favorites/ids', views.ids),
    path('me/favorites/products', views.products),
    path('me/favorites/products/<str:product_id>', views.product),
    path('me/favorites/shops', views.shops),
    path('me/favorites/shops/<str:shop_id>', views.shop),
]
