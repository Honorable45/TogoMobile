"""Adresses publiques du catalogue : accueil, recherche, fiche produit, avis, clic WhatsApp, vues."""

from django.urls import path

from . import views

urlpatterns = [
    path('home', views.home),
    path('catalog/products', views.catalog_products),
    path('products/<str:slug>', views.product_detail),
    path('products/<str:slug>/similar', views.product_similar),
    path('products/<str:slug>/reviews', views.product_reviews),
    path('shops/<str:slug>/reviews', views.shop_reviews),
    path('products/<str:id>/whatsapp', views.product_whatsapp),
    path('products/<str:id>/view', views.product_view),
]
