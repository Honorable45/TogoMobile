from rest_framework.decorators import api_view
from rest_framework.response import Response

from catalog.params import fail, page_query
from core.auth import require_user

from . import services


def _page(request):
    page, size, errors = page_query(request.query_params)
    fail(errors)
    return page, size


@api_view(['GET'])
def ids(request):
    return Response(services.ids(require_user(request).id))


@api_view(['GET'])
def products(request):
    user = require_user(request)
    return Response(services.products(user.id, *_page(request)))


@api_view(['PUT', 'DELETE'])
def product(request, product_id):
    user = require_user(request)
    if request.method == 'PUT':
        return Response(services.add_product(user.id, product_id))
    return Response(services.remove_product(user.id, product_id))


@api_view(['GET'])
def shops(request):
    user = require_user(request)
    return Response(services.shops(user.id, *_page(request)))


@api_view(['PUT', 'DELETE'])
def shop(request, shop_id):
    user = require_user(request)
    if request.method == 'PUT':
        return Response(services.add_shop(user.id, shop_id))
    return Response(services.remove_shop(user.id, shop_id))
