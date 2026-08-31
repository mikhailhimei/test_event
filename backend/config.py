"""Application paths, ports, and default persisted settings."""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB_DIR = ROOT / "web"
SETTINGS_FILE = ROOT / "settings.json"
PROXY_ADDON_FILE = ROOT / "proxy_addon.py"
PROXY_LOG_FILE = ROOT / "mitmproxy.log"
CAPTURE_HOST, CAPTURE_PORT = "127.0.0.1", 8787
UI_HOST, UI_PORT = "127.0.0.1", 8000
PROXY_PORT = 8080
DEFAULT_SETTINGS = {
    "requestPath": "",
    "scenarios": [
        {
            "name": "Сценарий 1",
            "rules": [{"keyPath": "event", "mode": "strict", "expected": "auth_click"}],
        }
    ],
    "commonElements": [],
}
