#!/usr/bin/env python3
"""FinUp Web updater service.

Binds only to localhost and exposes a small same-origin API through Nginx.
The update operation requires an admin token stored outside the web root.
"""
from __future__ import annotations

import fcntl
import hmac
import json
import os
import pathlib
import pwd
import grp
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlparse

APP_DIR = pathlib.Path(os.environ.get("FINUP_APP_DIR", "/var/www/finup")).resolve()
REPO_SLUG = os.environ.get("FINUP_REPO_SLUG", "upidgedang/finup-web").strip().lower()
BRANCH = os.environ.get("FINUP_BRANCH", "main").strip()
TOKEN = os.environ.get("FINUP_UPDATE_TOKEN", "")
HOST = os.environ.get("FINUP_UPDATER_HOST", "127.0.0.1")
PORT = int(os.environ.get("FINUP_UPDATER_PORT", "8731"))
LOCK_FILE = pathlib.Path(os.environ.get("FINUP_UPDATE_LOCK", "/run/finup-web-updater.lock"))
STATUS_CACHE_SECONDS = 30
MAX_FILE_SIZE = 25 * 1024 * 1024

_status_cache: dict[str, Any] = {"at": 0.0, "value": None}
_status_lock = threading.Lock()


def run(command: list[str], timeout: int = 120, check: bool = True) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env.update({"LANG": "C.UTF-8", "LC_ALL": "C.UTF-8", "GIT_TERMINAL_PROMPT": "0"})
    result = subprocess.run(
        command,
        cwd=str(APP_DIR),
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
        check=False,
    )
    if check and result.returncode != 0:
        message = (result.stderr or result.stdout or "Perintah gagal").strip()
        raise RuntimeError(message[:1200])
    return result


def git(*args: str, timeout: int = 120, check: bool = True) -> str:
    return run(["git", "-C", str(APP_DIR), *args], timeout=timeout, check=check).stdout.strip()


def remote_slug(remote_url: str) -> str:
    value = remote_url.strip().rstrip("/")
    if value.endswith(".git"):
        value = value[:-4]
    if "://" in value:
        path = urlparse(value).path.strip("/")
    elif ":" in value:
        path = value.split(":", 1)[1].strip("/")
    else:
        path = value.strip("/")
    pieces = path.split("/")
    return "/".join(pieces[-2:]).lower() if len(pieces) >= 2 else path.lower()


def ensure_repository() -> str:
    if not APP_DIR.is_dir() or not (APP_DIR / ".git").exists():
        raise RuntimeError(f"Folder {APP_DIR} bukan repository Git.")
    # GitHub web uploads commonly store files as 0644, while the VPS installer
    # needs executable permissions for scripts. Ignore mode-only differences so
    # they do not incorrectly lock automatic updates.
    git("config", "core.fileMode", "false")
    origin = git("config", "--get", "remote.origin.url")
    if remote_slug(origin) != REPO_SLUG:
        raise RuntimeError("Remote origin bukan repository FinUp Web yang diizinkan.")
    return origin


def read_version() -> dict[str, Any]:
    version_file = APP_DIR / "version.json"
    if not version_file.is_file():
        return {"versionName": "2.3.1", "versionCode": 29, "webRevision": 0}
    try:
        value = json.loads(version_file.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def current_status(refresh: bool = False) -> dict[str, Any]:
    with _status_lock:
        now = time.time()
        cached = _status_cache.get("value")
        if not refresh and cached and now - float(_status_cache.get("at", 0)) < STATUS_CACHE_SECONDS:
            return dict(cached)

        origin = ensure_repository()
        local_commit = git("rev-parse", "HEAD")
        remote_line = git("ls-remote", "--heads", "origin", f"refs/heads/{BRANCH}", timeout=45)
        if not remote_line:
            raise RuntimeError(f"Branch {BRANCH} tidak ditemukan pada repository.")
        remote_commit = remote_line.split()[0]
        dirty_output = git("status", "--porcelain", "--untracked-files=no")
        dirty_files = [line[3:] for line in dirty_output.splitlines() if len(line) > 3]
        dirty = bool(dirty_files)
        update_available = local_commit != remote_commit
        value = {
            "ok": True,
            "status": "update_available" if update_available else "up_to_date",
            "message": "Pembaruan tersedia." if update_available else "FinUp Web sudah versi terbaru.",
            "repository": origin,
            "repositorySlug": REPO_SLUG,
            "branch": BRANCH,
            "localCommit": local_commit,
            "remoteCommit": remote_commit,
            "updateAvailable": update_available,
            "dirty": dirty,
            "dirtyFiles": dirty_files[:100],
            "localVersion": read_version(),
            "checkedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        _status_cache.update({"at": now, "value": dict(value)})
        return value


def validate_release_tree() -> dict[str, Any]:
    required = [
        "index.html",
        "web-adapter-v231.js",
        "version.json",
        "logo-mark.png",
        "deploy/finup_updater.py",
    ]
    for relative in required:
        path = APP_DIR / relative
        if not path.is_file() or path.stat().st_size <= 0:
            raise RuntimeError(f"File wajib tidak valid: {relative}")

    version = read_version()
    repository = str(version.get("repository", ""))
    if remote_slug(repository) != REPO_SLUG:
        raise RuntimeError("version.json tidak menunjuk repository FinUp Web resmi.")
    if str(version.get("branch", "")) != BRANCH:
        raise RuntimeError("Branch pada version.json tidak sesuai konfigurasi updater.")

    banned_names = {
        "key.properties", "local.properties", "service-account.json",
        "google-service-account.json", ".env", "signing.properties",
    }
    banned_suffixes = {".jks", ".keystore", ".p12", ".pfx", ".pem", ".key", ".apk", ".aab", ".zip"}
    checked = 0
    for path in APP_DIR.rglob("*"):
        if ".git" in path.parts:
            continue
        if path.is_symlink():
            raise RuntimeError(f"Symlink tidak diizinkan pada web root: {path.relative_to(APP_DIR)}")
        if not path.is_file():
            continue
        checked += 1
        if path.name.lower() in banned_names or path.suffix.lower() in banned_suffixes:
            raise RuntimeError(f"File rahasia tidak boleh berada di repository web: {path.relative_to(APP_DIR)}")
        if path.stat().st_size > MAX_FILE_SIZE:
            raise RuntimeError(f"File terlalu besar pada web root: {path.relative_to(APP_DIR)}")

    index_text = (APP_DIR / "index.html").read_text(encoding="utf-8", errors="replace")
    if "web-adapter-v231.js" not in index_text:
        raise RuntimeError("Adapter web tidak dimuat oleh index.html.")
    return {"checkedFiles": checked, "version": version}


def set_permissions() -> None:
    try:
        uid = pwd.getpwnam("root").pw_uid
        gid = grp.getgrnam("www-data").gr_gid
    except KeyError as exc:
        raise RuntimeError("User/group root:www-data tidak tersedia.") from exc

    for path in [APP_DIR, *APP_DIR.rglob("*")]:
        if path.is_symlink():
            continue
        os.chown(path, uid, gid)
        os.chmod(path, 0o755 if path.is_dir() else 0o644)
    for script in (APP_DIR / "deploy").glob("*.sh"):
        os.chmod(script, 0o755)
    updater = APP_DIR / "deploy" / "finup_updater.py"
    if updater.exists():
        os.chmod(updater, 0o755)


def reload_nginx() -> None:
    run(["nginx", "-t"], timeout=30)
    run(["systemctl", "reload", "nginx"], timeout=30)


def perform_update() -> dict[str, Any]:
    ensure_repository()
    LOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
    with LOCK_FILE.open("w", encoding="utf-8") as lock_handle:
        try:
            fcntl.flock(lock_handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise RuntimeError("Proses pembaruan lain masih berjalan.") from exc

        dirty = git("status", "--porcelain", "--untracked-files=no")
        if dirty:
            raise RuntimeError("Repository memiliki perubahan lokal. Selesaikan atau simpan perubahan tersebut sebelum update otomatis.")

        old_commit = git("rev-parse", "HEAD")
        git("fetch", "--prune", "origin", BRANCH, timeout=180)
        remote_commit = git("rev-parse", f"origin/{BRANCH}")
        if old_commit == remote_commit:
            _status_cache.update({"at": 0.0, "value": None})
            status = current_status(refresh=True)
            status.update({"updated": False, "newCommit": old_commit})
            return status

        ancestor = run(
            ["git", "-C", str(APP_DIR), "merge-base", "--is-ancestor", old_commit, remote_commit],
            timeout=30,
            check=False,
        )
        if ancestor.returncode != 0:
            raise RuntimeError("Update bukan fast-forward. Periksa branch repository secara manual.")

        changed_files = git("diff", "--name-only", old_commit, remote_commit).splitlines()
        try:
            git("merge", "--ff-only", f"origin/{BRANCH}", timeout=180)
            validation = validate_release_tree()
            set_permissions()
            reload_nginx()
        except Exception:
            git("reset", "--hard", old_commit, timeout=60, check=False)
            try:
                set_permissions()
                reload_nginx()
            except Exception:
                pass
            raise

        _status_cache.update({"at": 0.0, "value": None})
        return {
            "ok": True,
            "updated": True,
            "status": "updated",
            "message": "Pembaruan FinUp Web berhasil dipasang.",
            "oldCommit": old_commit,
            "newCommit": remote_commit,
            "localCommit": remote_commit,
            "changedFiles": changed_files[:200],
            "validation": validation,
            "localVersion": read_version(),
            "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }


class Handler(BaseHTTPRequestHandler):
    server_version = "FinUpUpdater/1.1"

    def log_message(self, fmt: str, *args: Any) -> None:
        # Keep journald useful without logging request headers or tokens.
        print(f"{self.client_address[0]} - {fmt % args}", flush=True)

    def send_json(self, status_code: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0]
        try:
            if path == "/api/finup-update/health":
                self.send_json(200, {"ok": True, "service": "finup-web-updater"})
                return
            if path == "/api/finup-update/status":
                self.send_json(200, current_status(refresh="refresh=1" in self.path))
                return
            self.send_json(404, {"ok": False, "message": "Endpoint tidak ditemukan."})
        except Exception as exc:
            self.send_json(503, {"ok": False, "message": str(exc)[:1200]})

    def do_POST(self) -> None:
        path = self.path.split("?", 1)[0]
        if path != "/api/finup-update/run":
            self.send_json(404, {"ok": False, "message": "Endpoint tidak ditemukan."})
            return
        supplied = self.headers.get("X-FinUp-Update-Token", "")
        if not TOKEN or not hmac.compare_digest(supplied, TOKEN):
            self.send_json(401, {"ok": False, "message": "Token admin update tidak valid."})
            return
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length > 4096:
            self.send_json(413, {"ok": False, "message": "Payload terlalu besar."})
            return
        if length:
            self.rfile.read(length)
        try:
            self.send_json(200, perform_update())
        except Exception as exc:
            self.send_json(500, {"ok": False, "message": str(exc)[:1200]})


if __name__ == "__main__":
    if not TOKEN:
        raise SystemExit("FINUP_UPDATE_TOKEN belum dikonfigurasi.")
    ensure_repository()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"FinUp updater aktif di http://{HOST}:{PORT}", flush=True)
    server.serve_forever()
