import json
import threading
import urllib.request

from mitmproxy import ctx, http


def load(loader):
    loader.add_option("mobile_traffic_endpoint", str, "http://127.0.0.1:8787/api/captures", "Capture receiver URL")


def send_capture(endpoint, payload):
    try:
        request = urllib.request.Request(endpoint, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"}, method="POST")
        urllib.request.urlopen(request, timeout=2).close()
    except Exception as error:
        ctx.log.warn(f"Mobile Traffic Check: {error}")


def response(flow: http.HTTPFlow):
    if flow.request.host in {"127.0.0.1", "localhost"} and flow.request.port == 8787:
        return
    if "application/json" not in flow.request.headers.get("content-type", "").lower():
        return
    body = flow.request.get_text(strict=False)
    try:
        json.loads(body)
    except (TypeError, json.JSONDecodeError):
        return
    payload = {"request": {"url": flow.request.pretty_url, "method": flow.request.method, "postData": {"text": body}}, "response": {"status": flow.response.status_code}}
    threading.Thread(target=send_capture, args=(ctx.options.mobile_traffic_endpoint, payload), daemon=True).start()
