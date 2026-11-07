"""
Routes publiques du catalogue (/api/v1/…). Chaque vue lit la requête puis appelle le module qui fait le travail :
search (recherche), product (fiche, similaires, WhatsApp, vues), home (accueil), reviews (avis).
"""

from rest_framework.decorators import api_view, throttle_classes
from rest_framework.response import Response

from core.params import fail, page_query
from core.throttling import throttles

from . import home as home_data, product, reviews, search
from .params import catalog_query


@api_view(['GET'])
def home(request):
    return Response(home_data.home())


@api_view(['GET'])
def catalog_products(request):
    return Response(search.search(catalog_query(request.query_params)))


@api_view(['GET'])
def product_detail(request, slug):
    return Response(product.detail(slug))


@api_view(['GET'])
def product_similar(request, slug):
    return Response(product.similar(slug))


@api_view(['GET'])
def product_reviews(request, slug):
    page, size, errors = page_query(request.query_params)
    fail(errors)
    return Response(reviews.product_reviews(slug, page, size))


@api_view(['GET'])
def shop_reviews(request, slug):
    page, size, errors = page_query(request.query_params)
    fail(errors)
    return Response(reviews.shop_reviews(slug, page, size))


@api_view(['POST'])
@throttle_classes(throttles('whatsapp'))
def product_whatsapp(request, id):
    return Response(product.whatsapp(id))


@api_view(['POST'])
@throttle_classes(throttles('view'))
def product_view(request, id):
    product.view(id)
    return Response(status=204)
