"""mitmproxy process management and connection details."""

import os
import site
import socket
import subprocess
import sys
from pathlib import Path

from .config import (
    CAPTURE_HOST,
    CAPTURE_PORT,
    PROXY_ADDON_FILE,
    PROXY_LOG_FILE,
    PROXY_PORT,
)

proxy_process = None
proxy_log = None


def status():
    return {
        "running": proxy_process is not None and proxy_process.poll() is None,
        "port": PROXY_PORT,
    }


def connection_info():
    try:
        local_ip = socket.gethostbyname(socket.gethostname())
    except socket.gaierror:
        local_ip = "127.0.0.1"
    certificate_path = Path.home() / ".mitmproxy" / "mitmproxy-ca-cert.cer"
    return {
        "host": local_ip,
        "port": PROXY_PORT,
        "certificateUrl": "http://mitm.it",
        "certificatePath": str(certificate_path),
    }


def open_certificate_folder():
    certificate_path = Path.home() / ".mitmproxy" / "mitmproxy-ca-cert.cer"
    if not certificate_path.exists():
        return {"ok": False, "message": "Сертификат еще не создан."}
    if sys.platform == "win32":
        subprocess.Popen(["explorer.exe", f"/select,{certificate_path}"])
    elif sys.platform == "darwin":
        subprocess.Popen(["open", "-R", str(certificate_path)])
    else:
        subprocess.Popen(["xdg-open", str(certificate_path.parent)])
    return {"ok": True}


def find_mitmdump():
    names = ["mitmdump.exe"] if os.name == "nt" else ["mitmdump"]
    directories = [
        Path(sys.executable).parent,
        Path(site.getusersitepackages()).parent / "Scripts",
        Path(site.getusersitepackages()).parent / "bin",
    ]
    return next(
        (
            directory / name
            for directory in directories
            for name in names
            if (directory / name).exists()
        ),
        None,
    )


def start():
    global proxy_process, proxy_log
    if status()["running"]:
        return {"ok": True, "message": "mitmproxy уже запущен."}
    executable = find_mitmdump()
    if executable is None:
        return {
            "ok": False,
            "message": "mitmproxy не найден. Установите зависимости: pip install -r requirements.txt",
        }
    proxy_log = PROXY_LOG_FILE.open("a", encoding="utf-8")
    creationflags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
    proxy_process = subprocess.Popen(
        [
            str(executable),
            "-s",
            str(PROXY_ADDON_FILE),
            "--set",
            f"mobile_traffic_endpoint=http://{CAPTURE_HOST}:{CAPTURE_PORT}/api/captures",
        ],
        stdout=proxy_log,
        stderr=subprocess.STDOUT,
        creationflags=creationflags,
    )
    return {"ok": True, "message": f"mitmproxy запущен на порту {PROXY_PORT}."}
