from rest_framework.decorators import api_view, throttle_classes
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from core.auth import clear_cookie, create_session, require_user, revoke
from core.validation import Body

from . import services


def _throttle(name):
    return type(f'{name.title()}Throttle', (AnonRateThrottle,), {'scope': name})


@api_view(['POST'])
@throttle_classes([_throttle('register')])
def register(request):
    b = Body(request.data, {'name', 'email', 'phone', 'password'})
    name = b.text('name', 2, 80, msg='Le nom doit contenir entre 2 et 80 caractères.')
    email, phone, password = b.email('email'), b.phone('phone'), b.password('password')
    b.done()
    user_id = services.register(name, email, phone, password)
    res = Response(services.me(user_id), status=201)
    create_session(res, user_id, request.headers.get('User-Agent'))
    return res


@api_view(['POST'])
@throttle_classes([_throttle('login')])
def login(request):
    b = Body(request.data, {'identifier', 'password'})
    identifier = b.text('identifier', 3, 160)
    password = b.text('password', 1, 128, trim=False)
    b.done()
    user = services.validate_credentials(identifier, password)
    res = Response(services.me(user.id))
    create_session(res, user.id, request.headers.get('User-Agent'))
    return res


@api_view(['POST'])
def logout(request):
    if request.user:
        revoke(request.user.session_id)
    res = Response(status=204)
    clear_cookie(res)
    return res


@api_view(['GET', 'PATCH'])
def me(request):
    user = require_user(request)
    if request.method == 'GET':
        return Response(services.me(user.id))
    b = Body(request.data, {'name', 'email', 'phone'})
    name = b.text('name', 2, 80, required=False)
    email, phone = b.email('email'), b.phone('phone')
    b.done()
    return Response(services.update_profile(user.id, name, email, phone))


@api_view(['POST'])
@throttle_classes([_throttle('password_change')])
def password_change(request):
    user = require_user(request)
    b = Body(request.data, {'currentPassword', 'newPassword'})
    current = b.text('currentPassword', 1, 128, trim=False)
    new = b.password('newPassword')
    b.done()
    services.change_password(user.id, user.session_id, current, new)
    return Response(status=204)


@api_view(['POST'])
@throttle_classes([_throttle('password_forgot')])
def password_forgot(request):
    b = Body(request.data, {'email'})
    email = b.email('email', required=True)
    b.done()
    services.forgot_password(email)
    return Response(status=204)


@api_view(['POST'])
@throttle_classes([_throttle('password_reset')])
def password_reset(request):
    b = Body(request.data, {'token', 'password'})
    token = b.text('token', 20, 100, trim=False)
    password = b.password('password')
    b.done()
    services.reset_password(token, password)
    return Response(status=204)


@api_view(['GET'])
def sessions(request):
    user = require_user(request)
    return Response(services.list_sessions(user.id, user.session_id))


@api_view(['DELETE'])
def session_revoke(request, id):
    user = require_user(request)
    return Response(services.revoke_session(user.id, id))
