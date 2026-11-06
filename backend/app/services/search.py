"""Búsqueda web local-first.

1. SearXNG self-hosted (docker/VPS) si responde en searxng_base_url.
2. Fallback: DuckDuckGo Lite (scraping HTML ligero, sin API keys).
Jamás rompe el chat: si todo falla devuelve [] y la IA responde con su base.
"""

import re
from html import unescape

import httpx

from app.config import settings

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) VIALT/1.0 (Saniver medical)",
}

async def searxng_search(query: str, k: int = 3) -> list[dict]:
    try:
        async with httpx.AsyncClient(
            base_url=settings.searxng_base_url, timeout=6, headers=_HEADERS
        ) as client:
            resp = await client.get("/search", params={"q": query, "format": "json"})
            resp.raise_for_status()
            return [
                {
                    "title": r.get("title", ""),
                    "url": r.get("url", ""),
                    "snippet": (r.get("content") or "")[:300],
                }
                for r in resp.json().get("results", [])[:k]
            ]
    except Exception:
        return await _ddg_lite(query, k)


_PROXY_RE = re.compile(
    r'<a[^>]+href="//duckduckgo\.com/l/\?uddg=([^"&]+)[^"]*"[^>]*>(.*?)</a>', re.S
)
_SNIP_RE = re.compile(r'<td[^>]*class="result-snippet"[^>]*>(.*?)</td>', re.S)
_TAG_RE = re.compile(r"<[^>]+>")


async def _ddg_lite(query: str, k: int) -> list[dict]:
    """Scraping mínimo de lite.duckduckgo.com — sin claves ni SDKs."""
    try:
        async with httpx.AsyncClient(
            timeout=9, headers=_HEADERS, follow_redirects=True
        ) as client:
            resp = await client.get(
                "https://lite.duckduckgo.com/lite/", params={"q": query}
            )
            resp.raise_for_status()
            html = resp.text

        from urllib.parse import unquote

        links = _PROXY_RE.findall(html)
        snips = [" ".join(_TAG_RE.sub("", s).split()) for s in _SNIP_RE.findall(html)]
        salida: list[dict] = []
        for i, (uddg, title) in enumerate(links[:k]):
            salida.append(
                {
                    "title": unescape(_TAG_RE.sub("", title)).strip(),
                    "url": unquote(uddg),
                    "snippet": unescape(snips[i]) if i < len(snips) else "",
                }
            )
        return salida
    except Exception:
        return []
