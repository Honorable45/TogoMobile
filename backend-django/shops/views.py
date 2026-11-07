"""Routes publiques des boutiques (/api/v1/shops…). Le travail est fait dans services.py."""

from rest_framework.decorators import api_view
from rest_framework.response import Response

from . import services
from .params import shop_list_query


@api_view(['GET'])
def shop_list(request):
    return Response(services.shop_list(shop_list_query(request.query_params)))


@api_view(['GET'])
def shop_detail(request, slug):
    return Response(services.public_shop(slug))
