"""Forward JSON requests observed by mitmproxy to Mobile Traffic Check.

Run with:
  mitmdump -s integrations/mitmproxy_to_mobile_traffic.py \
    --set mobile_traffic_endpoint=http://127.0.0.1:8787/api/captures
"""

import json
import threading
import urllib.request

from mitmproxy import ctx, http


DEFAULT_ENDPOINT = "http://127.0.0.1:8787/api/captures"


def load(loader):
    loader.add_option(
        "mobile_traffic_endpoint",
        str,
        DEFAULT_ENDPOINT,
        "Mobile Traffic Check endpoint that receives captured JSON requests.",
    )


def send_capture(endpoint, payload):
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=2):
            pass
    except Exception as error:
        ctx.log.warn(f"Mobile Traffic Check: cannot send capture: {error}")


def response(flow: http.HTTPFlow):
    """Send a completed JSON request without delaying the proxied response."""
    if flow.request.host in {"127.0.0.1", "localhost"} and flow.request.port == 8787:
        return

    content_type = flow.request.headers.get("content-type", "")
    if "application/json" not in content_type.lower():
        return

    body = flow.request.get_text(strict=False)
    try:
        json.loads(body)
    except (TypeError, json.JSONDecodeError):
        return

    payload = {
        "request": {
            "url": flow.request.pretty_url,
            "method": flow.request.method,
            "postData": {"text": body},
        },
        "response": {"status": flow.response.status_code},
    }
    threading.Thread(
        target=send_capture,
        args=(ctx.options.mobile_traffic_endpoint, payload),
        daemon=True,
    ).start()
