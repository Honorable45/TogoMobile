from rest_framework.decorators import api_view
from rest_framework.response import Response

from catalog.params import shop_list_query

from . import services


@api_view(['GET'])
def shop_list(request):
    return Response(services.shop_list(shop_list_query(request.query_params)))


@api_view(['GET'])
def shop_detail(request, slug):
    return Response(services.public_shop(slug))
