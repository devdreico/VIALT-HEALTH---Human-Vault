"""Rate limit simple en memoria (token-bucket por ventana deslizante).

Suficiente para compliance básico: chat, login (fuerza bruta) y registro.
En multi-worker se migra a Redis — documentado en README.
"""

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

_BUCKETS: dict[str, deque] = defaultdict(deque)
_LIMITS: dict[str, tuple[int, float]] = {}  # clave → (límite, ventana_s)


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "desconocido"


def enforce(request: Request, bucket: str, limit: int, window: float = 60.0) -> None:
    key = f"{bucket}:{client_ip(request)}"
    now = time.monotonic()
    q = _BUCKETS[key]
    while q and now - q[0] > window:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(429, "Demasiadas solicitudes — espera un minuto")
    q.append(now)
