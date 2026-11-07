from rest_framework.decorators import api_view, throttle_classes
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from . import services
from core.errors import ApiError

from .params import catalog_query, page_query


class WhatsappThrottle(AnonRateThrottle):
    scope = 'whatsapp'


class ViewThrottle(AnonRateThrottle):
    scope = 'view'


@api_view(['GET'])
def home(request):
    return Response(services.home())


@api_view(['GET'])
def catalog_products(request):
    return Response(services.search(catalog_query(request.query_params)))


@api_view(['GET'])
def product_detail(request, slug):
    return Response(services.detail(slug))


@api_view(['GET'])
def product_similar(request, slug):
    return Response(services.similar(slug))


@api_view(['GET'])
def product_reviews(request, slug):
    page, size, errors = page_query(request.query_params)
    if errors:
        raise ApiError(400, next(iter(errors.values())), errors)
    return Response(services.product_reviews(slug, page, size))


@api_view(['GET'])
def shop_reviews(request, slug):
    page, size, errors = page_query(request.query_params)
    if errors:
        raise ApiError(400, next(iter(errors.values())), errors)
    return Response(services.shop_reviews(slug, page, size))


@api_view(['POST'])
@throttle_classes([WhatsappThrottle])
def product_whatsapp(request, id):
    return Response(services.whatsapp(id))


@api_view(['POST'])
@throttle_classes([ViewThrottle])
def product_view(request, id):
    services.view(id)
    return Response(status=204)
