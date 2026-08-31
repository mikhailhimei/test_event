"""Capture intake, scenario evaluation, and in-memory result storage."""

import json
import threading
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from .config import CAPTURE_HOST, CAPTURE_PORT
from .storage import get_settings

results = []


def values_by_path(source, key_path):
    values = [source]
    for key in key_path.split("."):
        next_values = []
        for value in values:
            if isinstance(value, list):
                next_values.extend(
                    item[key]
                    for item in value
                    if isinstance(item, dict) and key in item
                )
            elif isinstance(value, dict) and key in value:
                next_values.append(value[key])
        values = next_values
    return [
        item
        for value in values
        for item in (value if isinstance(value, list) else [value])
    ]


def comparable(value):
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return str(value if value is not None else "")


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
    expected_text = str(rule.get("expected", ""))
    positional = ";" in expected_text
    separator = ";" if positional else ","
    expected_groups = [
        [value.strip() for value in group.split("|") if value.strip()]
        for group in expected_text.split(separator)
    ]
    expected = [value for group in expected_groups for value in group]
    mode = rule.get("mode", "strict")

    if mode == "exists":
        matched = any(is_non_empty(value) for value in raw_actual)
    elif positional:
        all_objects_have_value = not isinstance(body, list) or len(actual) == len(body)
        matched = (
            all_objects_have_value
            and len(actual) == len(expected_groups)
            and all(
                actual[index] in group for index, group in enumerate(expected_groups)
            )
        )
    elif mode == "strict":
        all_objects_have_value = not isinstance(body, list) or len(actual) == len(body)
        matched = (
            all_objects_have_value
            and bool(actual)
            and all(value in expected for value in actual)
        )
    else:
        matched = bool(actual) and all(value in expected for value in actual)

    if positional:
        matched_by_index = [
            index < len(expected_groups) and actual[index] in expected_groups[index]
            for index in range(len(actual))
        ]
    elif mode == "exists":
        matched_by_index = [is_non_empty(value) for value in raw_actual]
    else:
        matched_by_index = [value in expected for value in actual]

    return {
        "keyPath": rule["keyPath"],
        "mode": mode,
        "expected": expected,
        "expectedGroups": expected_groups,
        "matchedExpected": [
            value
            for value, item_matched in zip(actual, matched_by_index)
            if item_matched
        ],
        "matchedByIndex": matched_by_index,
        "actual": actual,
        "description": rule.get("description", ""),
        "showInSearch": bool(rule.get("showInSearch")),
        "matched": matched,
    }


def evaluate_capture(entry):
    request = entry.get("request", entry)
    url = request.get("url")
    raw_body = (
        request.get("postData", {}).get("text")
        or request.get("body")
        or entry.get("requestBody")
    )
    try:
        body = json.loads(raw_body) if isinstance(raw_body, str) else raw_body
    except json.JSONDecodeError:
        return None

    settings = get_settings()
    if (
        not url
        or not body
        or (settings["requestPath"] and settings["requestPath"] not in url)
    ):
        return None

    scenarios = []
    for scenario_index, scenario in enumerate(settings["scenarios"]):
        if scenario.get("enabled", True) is False:
            continue
        common_ids = scenario.get(
            "commonElementIds", scenario.get("commonElementId", [])
        )
        common_ids = [common_ids] if isinstance(common_ids, str) else common_ids
        common_rules = [
            rule
            for element in settings.get("commonElements", [])
            if element.get("id") in common_ids
            for rule in element.get("rules", [])
        ]
        rules = [
            rule
            for rule in common_rules + scenario.get("rules", [])
            if rule.get("keyPath")
            and (rule.get("expected") or rule.get("mode") == "exists")
        ]
        checks = [evaluate_rule(rule, body) for rule in rules]
        strict_failed = any(
            check["mode"] == "strict" and not check["matched"] for check in checks
        )
        if not checks or strict_failed:
            continue
        scenario_matched = all(check["matched"] for check in checks)
        partial = not strict_failed and not scenario_matched
        if scenario_matched or partial:
            scenarios.append(
                {
                    "index": scenario_index,
                    "name": scenario.get("name") or "Сценарий",
                    "description": scenario.get("description", ""),
                    "checks": checks,
                    "matched": scenario_matched,
                    "partial": partial,
                }
            )

    if not scenarios:
        return None
    return {
        "id": str(uuid.uuid4()),
        "at": datetime.now(timezone.utc).isoformat(),
        "url": url,
        "method": request.get("method", "REQUEST"),
        "status": entry.get("response", {}).get("status", entry.get("status", 0)),
        "body": body,
        "scenarios": scenarios,
        "partialMatch": any(scenario["partial"] for scenario in scenarios),
    }


def store_captures(payload):
    entries = (
        payload.get("entries", payload.get("log", {}).get("entries", [payload]))
        if isinstance(payload, dict)
        else payload
    )
    entries = entries if isinstance(entries, list) else [entries]
    records = [
        record
        for entry in entries
        if isinstance(entry, dict)
        if (record := evaluate_capture(entry))
    ]
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
