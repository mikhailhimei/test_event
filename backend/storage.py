"""Settings persistence."""

import json

from .config import DEFAULT_SETTINGS, SETTINGS_FILE


def initialize_storage():
    if not SETTINGS_FILE.exists():
        SETTINGS_FILE.write_text(
            json.dumps(DEFAULT_SETTINGS, ensure_ascii=False, indent=2), encoding="utf-8"
        )


def get_settings():
    return json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))


def save_settings(settings):
    normalized = {
        "requestPath": str(settings.get("requestPath", "")),
        "scenarios": (
            settings.get("scenarios", [])
            if isinstance(settings.get("scenarios"), list)
            else []
        ),
        "commonElements": (
            settings.get("commonElements", [])
            if isinstance(settings.get("commonElements"), list)
            else []
        ),
    }
    SETTINGS_FILE.write_text(
        json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return normalized
