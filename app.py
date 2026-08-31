#!/usr/bin/env python3
"""Eel application entry point for Mobile Traffic Check."""

import threading

import eel

from backend import captures, proxy, storage
from backend.config import PROXY_LOG_FILE, UI_HOST, UI_PORT, WEB_DIR


@eel.expose
def ui_settings():
    return storage.get_settings()


@eel.expose
def ui_save_settings(settings):
    return storage.save_settings(settings)


@eel.expose
def ui_results():
    return captures.results


@eel.expose
def ui_clear_results():
    captures.results.clear()


@eel.expose
def ui_proxy_status():
    return proxy.status()


@eel.expose
def ui_proxy_info():
    return proxy.connection_info()


@eel.expose
def ui_open_certificate_folder():
    return proxy.open_certificate_folder()


@eel.expose
def ui_start_proxy():
    return proxy.start()


def ensure_frontend_build():
    if not (WEB_DIR / "index.html").exists():
        raise RuntimeError(
            "Интерфейс не собран. Выполните: npm install && npm run build"
        )


def main():
    ensure_frontend_build()
    storage.initialize_storage()
    PROXY_LOG_FILE.write_text("", encoding="utf-8")
    captures.start_capture_server()
    eel.init(str(WEB_DIR))
    threading.Thread(target=proxy.start, daemon=True).start()
    eel.start("index.html", host=UI_HOST, port=UI_PORT, size=(1000, 800), block=True)


if __name__ == "__main__":
    main()
