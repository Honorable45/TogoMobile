"""
Envoi d'e-mails, mêmes pilotes que l'API Node :
  - console : développement uniquement (affiche le message dans les journaux) ;
  - resend  : API HTTP Resend.
"""

import json
import logging
import urllib.request

from django.conf import settings

log = logging.getLogger('mail')
last_message = None  # dernier message du pilote console (tests)


def send(to: str, subject: str, text: str):
    global last_message
    m = settings.MAIL
    if m['driver'] == 'console':
        last_message = {'to': to, 'subject': subject, 'text': text}
        log.info('[DEV] E-mail pour %s — %s\n%s', to, subject, text)
        return
    req = urllib.request.Request(
        'https://api.resend.com/emails',
        data=json.dumps({'from': m['from'], 'to': [to], 'subject': subject, 'text': text}).encode(),
        headers={'Authorization': f"Bearer {m['resend_api_key']}", 'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            if res.status >= 300:
                raise RuntimeError(res.status)
    except Exception as e:
        log.error("Échec d'envoi d'e-mail (%s)", e)
        raise RuntimeError("Échec d'envoi de l'e-mail") from e
