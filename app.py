#!/usr/bin/env python3
"""Desktop UI and capture receiver for Mobile Traffic Check."""

import json
import site
import socket
import subprocess
import sys
import threading
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import eel


ROOT = Path(__file__).parent
SETTINGS_FILE = ROOT / "settings.json"
CAPTURE_HOST, CAPTURE_PORT = "127.0.0.1", 8787
UI_HOST, UI_PORT = "127.0.0.1", 8000
DEFAULT_SETTINGS = {
    "requestPath": "",
    "scenarios": [{"name": "Сценарий 1", "rules": [{"keyPath": "event", "mode": "strict", "expected": "auth_click"}]}],
    "commonElements": [],
}
proxy_process = None
proxy_log = None
results = []


def initialize_storage():
    if not SETTINGS_FILE.exists():
        SETTINGS_FILE.write_text(json.dumps(DEFAULT_SETTINGS, ensure_ascii=False, indent=2), encoding="utf-8")


def get_settings():
    return json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))


def save_settings(settings):
    normalized = {
        "requestPath": str(settings.get("requestPath", "")),
        "scenarios": settings.get("scenarios", []) if isinstance(settings.get("scenarios"), list) else [],
        "commonElements": settings.get("commonElements", []) if isinstance(settings.get("commonElements"), list) else [],
    }
    SETTINGS_FILE.write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8")
    return normalized


def values_by_path(source, key_path):
    values = [source]
    for key in key_path.split("."):
        next_values = []
        for value in values:
            if isinstance(value, list):
                next_values.extend(item[key] for item in value if isinstance(item, dict) and key in item)
            elif isinstance(value, dict) and key in value:
                next_values.append(value[key])
        values = next_values
    return [item for value in values for item in (value if isinstance(value, list) else [value])]


def comparable(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")) if isinstance(value, (dict, list)) else str(value if value is not None else "")


def is_non_empty(value):
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, dict)):
        return bool(value)
    return True


def evaluate_rule(rule, body):
    raw_actual = values_by_path(body, rule["keyPath"])
    actual = [comparable(value) for value in raw_actual]
    expected_groups = [[value.strip() for value in group.split("|") if value.strip()] for group in str(rule.get("expected", "")).split(",") if group.strip()]
    expected = [value for group in expected_groups for value in group]
    mode = rule.get("mode", "strict")
    if mode == "exists":
        matched = any(is_non_empty(value) for value in raw_actual)
    elif len(expected_groups) > 1:
        matched = len(actual) == len(expected_groups) and all(actual[index] in group for index, group in enumerate(expected_groups))
    elif mode == "loose":
        matched = bool(actual) and any(value in expected for value in actual)
    else:
        matched = bool(actual) and all(value in expected for value in actual)
    return {"keyPath": rule["keyPath"], "mode": mode, "expected": expected, "matchedExpected": [value for value in actual if value in expected], "actual": actual, "description": rule.get("description", ""), "showInSearch": bool(rule.get("showInSearch")), "matched": matched}


def evaluate_capture(entry):
    request = entry.get("request", entry)
    url = request.get("url")
    raw_body = request.get("postData", {}).get("text") or request.get("body") or entry.get("requestBody")
    try:
        body = json.loads(raw_body) if isinstance(raw_body, str) else raw_body
    except json.JSONDecodeError:
        return None
    settings = get_settings()
    if not url or not body or (settings["requestPath"] and settings["requestPath"] not in url):
        return None
    scenarios = []
    for scenario in settings["scenarios"]:
        if scenario.get("enabled", True) is False:
            continue
        common_ids = scenario.get("commonElementIds", scenario.get("commonElementId", []))
        if isinstance(common_ids, str):
            common_ids = [common_ids]
        common_rules = [
            rule
            for element in settings.get("commonElements", [])
            if element.get("id") in common_ids
            for rule in element.get("rules", [])
        ]
        rules = [rule for rule in common_rules + scenario.get("rules", []) if rule.get("keyPath") and (rule.get("expected") or rule.get("mode") == "exists")]
        checks = [evaluate_rule(rule, body) for rule in rules]
        if not checks or any(check["mode"] == "strict" and not check["matched"] for check in checks):
            continue
        scenarios.append({"name": scenario.get("name") or "Сценарий", "description": scenario.get("description", ""), "checks": checks, "matched": all(check["matched"] for check in checks)})
    if not scenarios:
        return None
    return {"id": str(uuid.uuid4()), "at": datetime.now(timezone.utc).isoformat(), "url": url, "method": request.get("method", "REQUEST"), "status": entry.get("response", {}).get("status", entry.get("status", 0)), "body": body, "scenarios": scenarios}


def store_captures(payload):
    entries = payload.get("entries", payload.get("log", {}).get("entries", [payload])) if isinstance(payload, dict) else payload
    if not isinstance(entries, list):
        entries = [entries]
    records = [record for entry in entries if isinstance(entry, dict) and (record := evaluate_capture(entry))]
    results[0:0] = records
    del results[300:]
    return len(records)


class CaptureHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/api/captures":
            self.send_error(404)
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size > 10 * 1024 * 1024:
                raise ValueError("Размер запроса превышает 10 МБ")
            accepted = store_captures(json.loads(self.rfile.read(size)))
            self.send_response(202)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True, "accepted": accepted}).encode())
        except (ValueError, json.JSONDecodeError) as error:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": False, "error": str(error)}).encode())

    def log_message(self, *_):
        return


def start_capture_server():
    server = ThreadingHTTPServer((CAPTURE_HOST, CAPTURE_PORT), CaptureHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()


@eel.expose
def ui_settings():
    return get_settings()


@eel.expose
def ui_save_settings(settings):
    return save_settings(settings)


@eel.expose
def ui_results():
    return results


@eel.expose
def ui_clear_results():
    results.clear()


@eel.expose
def ui_proxy_status():
    return {"running": proxy_process is not None and proxy_process.poll() is None, "port": 8080}


@eel.expose
def ui_proxy_info():
    try:
        local_ip = socket.gethostbyname(socket.gethostname())
    except socket.gaierror:
        local_ip = "127.0.0.1"
    return {
        "host": local_ip,
        "port": 8080,
        "certificateUrl": "http://mitm.it",
        "certificatePath": str(Path.home() / ".mitmproxy" / "mitmproxy-ca-cert.cer"),
    }


@eel.expose
def ui_open_certificate_folder():
    certificate_path = Path.home() / ".mitmproxy" / "mitmproxy-ca-cert.cer"
    if not certificate_path.exists():
        return {"ok": False, "message": "Сертификат еще не создан."}
    subprocess.Popen(["explorer.exe", f"/select,{certificate_path}"])
    return {"ok": True}


@eel.expose
def ui_start_proxy():
    global proxy_process, proxy_log
    if proxy_process is not None and proxy_process.poll() is None:
        return {"ok": True, "message": "mitmproxy уже запущен."}
    executable_candidates = [
        Path(sys.executable).parent / "Scripts" / "mitmdump.exe",
        Path(site.getusersitepackages()).parent / "Scripts" / "mitmdump.exe",
    ]
    executable = next((path for path in executable_candidates if path.exists()), None)
    if executable is None:
        return {"ok": False, "message": "mitmproxy не найден. Установите зависимости: pip install -r requirements.txt"}
    proxy_log = (ROOT / "mitmproxy.log").open("a", encoding="utf-8")
    proxy_process = subprocess.Popen(
        [str(executable), "-s", str(ROOT / "proxy_addon.py"), "--set", f"mobile_traffic_endpoint=http://{CAPTURE_HOST}:{CAPTURE_PORT}/api/captures"],
        stdout=proxy_log,
        stderr=subprocess.STDOUT,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
    )
    return {"ok": True, "message": "mitmproxy запущен на порту 8080."}


def main():
    initialize_storage()
    start_capture_server()
    eel.init(str(ROOT / "web"))
    threading.Thread(target=ui_start_proxy, daemon=True).start()
    eel.start("index.html", host=UI_HOST, port=UI_PORT, block=True)


if __name__ == "__main__":
    main()
