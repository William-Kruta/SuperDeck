from __future__ import annotations

import asyncio
import os
import shlex
import shutil
import subprocess
import json
import tomllib
from dataclasses import dataclass
from pathlib import Path
from typing import Literal
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

import yaml
from fastapi import BackgroundTasks, FastAPI, HTTPException, Query, Request as FastAPIRequest
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator


BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "config" / "apps.yaml"
STATIC_DIR = BASE_DIR / "static"
ASSETS_DIR = BASE_DIR.parent / "assets"
BACKGROUNDS_DIR = ASSETS_DIR / "backgrounds"
LAUNCH_LOG_PATH = Path(os.getenv("SUPERDECK_LAUNCH_LOG", "/tmp/superdeck-launch.log"))
CONTROLLER_PROFILE = BASE_DIR.parent / "scripts" / "youtube-tv-controller.amgp"
ANTIMICROX_APP_IDS = {"youtube", "jellyfin"}
ANTIMICROX_STOP_APP_IDS = {"steam"}

_antimicrox_process: subprocess.Popen[bytes] | None = None
CHROMIUM_CANDIDATES = (
    "chromium",
    "chromium-browser",
    "google-chrome",
    "google-chrome-stable",
    "brave-browser",
    "microsoft-edge",
)
BACKGROUND_EXTENSIONS = {".apng", ".avif", ".gif", ".jpg", ".jpeg", ".png", ".webm", ".webp", ".mp4"}
MAX_BACKGROUND_BYTES = 200 * 1024 * 1024


AppKind = Literal["web", "command"]
SystemActionKind = Literal[
    "restart_mediaserver",
    "quit_mediaserver",
    "restart_jellyfin",
    "sleep",
    "shutdown",
]


class MediaApp(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]*$")
    name: str
    kind: AppKind
    description: str = ""
    icon: str | None = None
    url: str | None = None
    health_url: str | None = None
    command: str | list[str] | None = None
    category: str = "Apps"
    requires_display: bool = True
    require_reachable: bool = True
    chromium_args: list[str] = []
    logo: str | None = None
    artwork: str | None = None

    @field_validator("url", "health_url")
    @classmethod
    def validate_local_url(cls, value: str | None) -> str | None:
        if value is None:
            return value

        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("URL apps must use an absolute http(s) URL")

        return value


class LaunchResult(BaseModel):
    id: str
    action: Literal["started_process"]
    target: str
    pid: int
    log_path: str


class HealthResponse(BaseModel):
    status: str = "ok"


class AboutResponse(BaseModel):
    version: str


class DependencyStatus(BaseModel):
    name: str
    executable: str
    installed: bool
    path: str | None = None


class SessionStatus(BaseModel):
    display: str | None = None
    wayland_display: str | None = None
    xauthority: str | None = None
    dbus_session_bus_address: str | None = None
    xdg_session_type: str | None = None
    has_graphical_session: bool


class ServiceStatus(BaseModel):
    name: str
    installed: bool
    active: bool
    reachable: bool
    url: str


class AppStatus(BaseModel):
    app_id: str
    state: Literal["ok", "warn", "error"]
    label: str
    detail: str


class BackgroundAsset(BaseModel):
    name: str
    path: str
    kind: Literal["image", "video"]
    size: int


class SystemActionResult(BaseModel):
    action: SystemActionKind
    status: Literal["started", "scheduled"]
    detail: str


class LogResponse(BaseModel):
    path: str
    content: str


class DiagnosticsResponse(BaseModel):
    cpu_temp: int | None
    gpu_temp: int | None
    gpu_power_w: float | None


@dataclass(frozen=True)
class AppRegistry:
    apps: tuple[MediaApp, ...]

    @classmethod
    def load(cls, path: Path = CONFIG_PATH) -> "AppRegistry":
        if not path.exists():
            return cls(apps=())

        with path.open("r", encoding="utf-8") as config_file:
            raw_config = yaml.safe_load(config_file) or {}

        apps = tuple(MediaApp.model_validate(item) for item in raw_config.get("apps", []))
        return cls(apps=apps)

    def get(self, app_id: str) -> MediaApp | None:
        return next((app for app in self.apps if app.id == app_id), None)


def create_app() -> FastAPI:
    app = FastAPI(title="SuperDeck Console Shell")
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    @app.get("/api/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse()

    @app.get("/api/apps", response_model=list[MediaApp])
    async def list_apps() -> list[MediaApp]:
        return list(AppRegistry.load().apps)

    @app.get("/api/about", response_model=AboutResponse)
    async def about() -> AboutResponse:
        return AboutResponse(version=_project_version())

    @app.get("/api/dependencies", response_model=list[DependencyStatus])
    async def dependencies() -> list[DependencyStatus]:
        return _dependency_statuses()

    @app.get("/api/session", response_model=SessionStatus)
    async def session() -> SessionStatus:
        return _session_status()

    @app.get("/api/services", response_model=list[ServiceStatus])
    async def services() -> list[ServiceStatus]:
        return [_jellyfin_status()]

    @app.get("/api/app-statuses", response_model=list[AppStatus])
    async def app_statuses() -> list[AppStatus]:
        return [_app_status(media_app) for media_app in AppRegistry.load().apps]

    @app.get("/api/backgrounds", response_model=list[BackgroundAsset])
    async def backgrounds() -> list[BackgroundAsset]:
        return _background_assets()

    @app.post("/api/backgrounds", response_model=BackgroundAsset)
    async def upload_background(
        request: FastAPIRequest,
        filename: str = Query(min_length=1, max_length=120),
    ) -> BackgroundAsset:
        safe_name = _safe_background_filename(filename)
        data = await request.body()
        if not data:
            raise HTTPException(status_code=400, detail="Background upload was empty.")
        if len(data) > MAX_BACKGROUND_BYTES:
            raise HTTPException(status_code=413, detail="Background upload is too large.")

        BACKGROUNDS_DIR.mkdir(parents=True, exist_ok=True)
        destination = _unique_background_path(BACKGROUNDS_DIR / safe_name)
        destination.write_bytes(data)
        return _background_asset(destination)

    @app.get("/api/logs/launch", response_model=LogResponse)
    async def launch_log() -> LogResponse:
        return _launch_log()

    @app.post("/api/system/actions/{action}", response_model=SystemActionResult)
    async def system_action(action: SystemActionKind, background_tasks: BackgroundTasks) -> SystemActionResult:
        if action == "quit_mediaserver":
            background_tasks.add_task(_exit_process)
            return SystemActionResult(
                action=action,
                status="scheduled",
                detail="SuperDeck will stop after this response.",
            )
        if action == "restart_mediaserver":
            command = _mediaserver_restart_command()
            if command is None:
                raise HTTPException(
                    status_code=424,
                    detail="Set SUPERDECK_RESTART_COMMAND to enable restart from the UI.",
                )
            background_tasks.add_task(_run_system_command, command)
            return SystemActionResult(
                action=action,
                status="scheduled",
                detail=f"Restart command scheduled: {shlex.join(command)}",
            )

        command = _system_action_command(action)
        if command is None:
            raise HTTPException(status_code=400, detail=f"Unsupported action: {action}")
        process = _run_system_command(command)
        return SystemActionResult(
            action=action,
            status="started",
            detail=f"Started: {shlex.join(command)} (pid {process.pid})",
        )

    @app.post("/api/apps/{app_id}/launch", response_model=LaunchResult)
    async def launch_app(app_id: str) -> LaunchResult:
        media_app = AppRegistry.load().get(app_id)
        if media_app is None:
            raise HTTPException(status_code=404, detail=f"Unknown app: {app_id}")

        if app_id in ANTIMICROX_APP_IDS:
            await asyncio.to_thread(_antimicrox_start)
        elif app_id in ANTIMICROX_STOP_APP_IDS:
            await asyncio.to_thread(_antimicrox_stop)

        if media_app.kind == "web":
            if not media_app.url:
                raise HTTPException(status_code=500, detail=f"{app_id} is missing a URL")
            if media_app.require_reachable:
                await asyncio.to_thread(_require_url_reachable, media_app, media_app.health_url or media_app.url)
            try:
                process = await asyncio.to_thread(_launch_chromium_app, media_app.url, media_app.chromium_args)
            except FileNotFoundError as exc:
                raise _missing_executable_error(exc.filename or "chromium") from exc
            return LaunchResult(
                id=app_id,
                action="started_process",
                target=media_app.url,
                pid=process.pid,
                log_path=str(LAUNCH_LOG_PATH),
            )

        command = _command_args(media_app.command)
        if not command:
            raise HTTPException(status_code=500, detail=f"{app_id} is missing a command")

        if media_app.requires_display:
            _require_graphical_session()

        try:
            process = await asyncio.to_thread(_start_process, command)
        except FileNotFoundError as exc:
            raise _missing_executable_error(exc.filename or command[0]) from exc
        return LaunchResult(
            id=app_id,
            action="started_process",
            target=command[0],
            pid=process.pid,
            log_path=str(LAUNCH_LOG_PATH),
        )

    @app.api_route("/assets/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    async def frontend_asset(path: str) -> FileResponse:
        asset_path = (ASSETS_DIR / path).resolve()
        if not path or ASSETS_DIR.resolve() not in asset_path.parents or not asset_path.is_file():
            raise HTTPException(status_code=404, detail="Asset not found")
        return FileResponse(asset_path, media_type=_asset_media_type(asset_path))

    @app.get("/{path:path}", include_in_schema=False)
    async def frontend(path: str) -> FileResponse:
        asset_path = (STATIC_DIR / path).resolve()
        if path and STATIC_DIR.resolve() in asset_path.parents and asset_path.is_file():
            return FileResponse(asset_path)
        return FileResponse(STATIC_DIR / "index.html")

    return app


def _asset_media_type(path: Path) -> str | None:
    with path.open("rb") as asset_file:
        header = asset_file.read(12)
    if header.startswith(b"RIFF") and header[8:12] == b"WEBP":
        return "image/webp"
    return None


def _project_version() -> str:
    pyproject_path = BASE_DIR.parent / "pyproject.toml"
    try:
        with pyproject_path.open("rb") as pyproject_file:
            pyproject = tomllib.load(pyproject_file)
    except (FileNotFoundError, tomllib.TOMLDecodeError):
        return "unknown"
    return str(pyproject.get("project", {}).get("version", "unknown"))


def _background_assets() -> list[BackgroundAsset]:
    if not BACKGROUNDS_DIR.exists():
        return []
    assets = [
        _background_asset(path)
        for path in sorted(BACKGROUNDS_DIR.iterdir(), key=lambda item: item.name.lower())
        if path.is_file() and path.suffix.lower() in BACKGROUND_EXTENSIONS
    ]
    return assets


def _background_asset(path: Path) -> BackgroundAsset:
    return BackgroundAsset(
        name=path.name,
        path=f"/assets/backgrounds/{path.name}",
        kind=_background_kind(path),
        size=path.stat().st_size,
    )


def _background_kind(path: Path) -> Literal["image", "video"]:
    if path.suffix.lower() in {".mp4", ".webm"}:
        return "video"
    return "image"


def _safe_background_filename(filename: str) -> str:
    name = Path(filename).name.strip().replace(" ", "-")
    if not name:
        raise HTTPException(status_code=400, detail="Background filename is required.")
    suffix = Path(name).suffix.lower()
    if suffix not in BACKGROUND_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported background media type.")
    safe_chars = []
    for char in name:
        if char.isalnum() or char in {"-", "_", "."}:
            safe_chars.append(char)
        else:
            safe_chars.append("-")
    return "".join(safe_chars).strip(".")


def _unique_background_path(path: Path) -> Path:
    if not path.exists():
        return path
    stem = path.stem
    suffix = path.suffix
    for index in range(1, 1000):
        candidate = path.with_name(f"{stem}-{index}{suffix}")
        if not candidate.exists():
            return candidate
    raise HTTPException(status_code=409, detail="Too many background files with this name.")


def _launch_log() -> LogResponse:
    if not LAUNCH_LOG_PATH.exists():
        return LogResponse(path=str(LAUNCH_LOG_PATH), content="")
    content = LAUNCH_LOG_PATH.read_text(encoding="utf-8", errors="replace")
    return LogResponse(path=str(LAUNCH_LOG_PATH), content=content[-12000:])


def _mediaserver_restart_command() -> list[str] | None:
    configured = os.getenv("SUPERDECK_RESTART_COMMAND")
    if configured:
        return shlex.split(configured)
    systemctl = _resolve_executable(("systemctl",))
    if systemctl is None:
        return None
    return [systemctl, "--user", "restart", "mediaserver-user.service"]


def _system_action_command(action: SystemActionKind) -> list[str] | None:
    systemctl = _resolve_executable(("systemctl",))
    if action == "restart_jellyfin" and systemctl:
        return [systemctl, "restart", "jellyfin"]
    if action == "sleep" and systemctl:
        return [systemctl, "suspend"]
    if action == "shutdown" and systemctl:
        return [systemctl, "poweroff"]
    return None


def _run_system_command(command: list[str]) -> subprocess.Popen[bytes]:
    LAUNCH_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    log_file = LAUNCH_LOG_PATH.open("ab")
    log_file.write(f"\n\nSystem action: {shlex.join(command)}\n".encode())
    log_file.flush()
    return subprocess.Popen(
        command,
        stdin=subprocess.DEVNULL,
        stdout=log_file,
        stderr=subprocess.STDOUT,
        start_new_session=True,
        env=os.environ.copy(),
    )


def _exit_process() -> None:
    os._exit(0)


def _command_args(command: str | list[str] | None) -> list[str]:
    if command is None:
        return []
    if isinstance(command, str):
        return shlex.split(command)
    return command


def _launch_executable(command: list[str]) -> str | None:
    if not command:
        return None
    if command[0] == "env":
        for part in command[1:]:
            if "=" not in part:
                return part
        return None
    return command[0]


def _resolve_command_executable(executable: str) -> str | None:
    if "/" in executable:
        path = (BASE_DIR.parent / executable).resolve()
        if path.is_file():
            return str(path)
        direct_path = Path(executable).expanduser()
        if direct_path.is_file():
            return str(direct_path)
        return None
    return _resolve_executable((executable,))


def _start_process(command: list[str]) -> subprocess.Popen[bytes]:
    executable = _resolve_executable((command[0],))
    if executable is None:
        raise FileNotFoundError(command[0])

    resolved_command = [executable, *command[1:]]
    LAUNCH_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    log_file = LAUNCH_LOG_PATH.open("ab")
    log_file.write(f"\n\nLaunching: {shlex.join(resolved_command)}\n".encode())
    log_file.write(f"DISPLAY={os.getenv('DISPLAY', '')}\n".encode())
    log_file.write(f"WAYLAND_DISPLAY={os.getenv('WAYLAND_DISPLAY', '')}\n".encode())
    log_file.flush()
    return subprocess.Popen(
        resolved_command,
        stdin=subprocess.DEVNULL,
        stdout=log_file,
        stderr=subprocess.STDOUT,
        start_new_session=True,
        env=os.environ.copy(),
    )


def _dependency_statuses() -> list[DependencyStatus]:
    executables = {
        "Jellyfin Server": "jellyfin",
        "mpv": "mpv",
        "Steam": "steam",
        "RetroArch": "retroarch",
    }
    chromium_candidates = _chromium_candidates()
    chromium_path = _resolve_executable(chromium_candidates)
    statuses = [
        DependencyStatus(
            name="Chromium",
            executable=" or ".join(chromium_candidates),
            installed=chromium_path is not None,
            path=chromium_path,
        )
    ]
    for name, executable in executables.items():
        path = _resolve_executable((executable,))
        statuses.append(
            DependencyStatus(
                name=name,
                executable=executable,
                installed=path is not None,
                path=path,
            )
        )
    return statuses


def _app_status(media_app: MediaApp) -> AppStatus:
    if media_app.kind == "web":
        chromium_path = _resolve_executable(_chromium_candidates())
        if chromium_path is None:
            return AppStatus(
                app_id=media_app.id,
                state="error",
                label="Missing browser",
                detail="Chromium-compatible browser is not installed or not on PATH.",
            )
        if media_app.require_reachable and media_app.url:
            url = media_app.health_url or media_app.url
            if not _url_is_reachable(url):
                return AppStatus(
                    app_id=media_app.id,
                    state="warn",
                    label="Offline",
                    detail=f"{media_app.name} is not reachable at {url}.",
                )
        return AppStatus(
            app_id=media_app.id,
            state="ok",
            label="Ready",
            detail=f"Browser target configured for {media_app.name}.",
        )

    command = _command_args(media_app.command)
    executable = _launch_executable(command)
    if executable is None:
        return AppStatus(
            app_id=media_app.id,
            state="error",
            label="Not configured",
            detail=f"{media_app.name} is missing a launch command.",
        )
    if _resolve_command_executable(executable) is None:
        return AppStatus(
            app_id=media_app.id,
            state="error",
            label="Missing command",
            detail=f"'{executable}' is not installed or the configured script is missing.",
        )
    if media_app.requires_display and not _session_status().has_graphical_session:
        return AppStatus(
            app_id=media_app.id,
            state="warn",
            label="No display",
            detail="SuperDeck is not running inside a graphical desktop session.",
        )
    return AppStatus(
        app_id=media_app.id,
        state="ok",
        label="Ready",
        detail=f"Launch command found for {media_app.name}.",
    )


def _session_status() -> SessionStatus:
    display = os.getenv("DISPLAY")
    wayland_display = os.getenv("WAYLAND_DISPLAY")
    return SessionStatus(
        display=display,
        wayland_display=wayland_display,
        xauthority=os.getenv("XAUTHORITY"),
        dbus_session_bus_address=os.getenv("DBUS_SESSION_BUS_ADDRESS"),
        xdg_session_type=os.getenv("XDG_SESSION_TYPE"),
        has_graphical_session=bool(display or wayland_display),
    )


def _require_graphical_session() -> None:
    if not _session_status().has_graphical_session:
        raise HTTPException(
            status_code=424,
            detail=(
                "SuperDeck is not running inside a graphical desktop session. "
                "Start it from a terminal inside your desktop, or use the systemd "
                "user service instead of the system service. Check /api/session."
            ),
        )


def _require_url_reachable(media_app: MediaApp, url: str) -> None:
    request = Request(url, method="GET", headers={"User-Agent": "SuperDeck/0.1"})
    try:
        with urlopen(request, timeout=2) as response:
            if response.status >= 500:
                raise HTTPException(
                    status_code=424,
                    detail=f"{media_app.name} responded with HTTP {response.status} at {url}.",
                )
    except HTTPError as exc:
        if exc.code >= 500:
            raise HTTPException(
                status_code=424,
                detail=f"{media_app.name} responded with HTTP {exc.code} at {url}.",
            ) from exc
    except (ConnectionError, TimeoutError, URLError, OSError) as exc:
        raise HTTPException(
            status_code=424,
            detail=(
                f"{media_app.name} is not reachable at {url}. "
                "Start the service or update its URL in mediaserver/config/apps.yaml."
            ),
        ) from exc


def _jellyfin_status() -> ServiceStatus:
    url = "http://localhost:8096"
    registry_app = AppRegistry.load().get("jellyfin")
    if registry_app and registry_app.url:
        url = registry_app.health_url or registry_app.url

    return ServiceStatus(
        name="jellyfin",
        installed=_resolve_executable(("jellyfin",)) is not None,
        active=_systemd_service_active("jellyfin"),
        reachable=_url_is_reachable(url),
        url=url,
    )


def _systemd_service_active(service_name: str) -> bool:
    systemctl = _resolve_executable(("systemctl",))
    if systemctl is None:
        return False
    result = subprocess.run(
        [systemctl, "is-active", "--quiet", service_name],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return result.returncode == 0


def _url_is_reachable(url: str) -> bool:
    request = Request(url, method="GET", headers={"User-Agent": "SuperDeck/0.1"})
    try:
        with urlopen(request, timeout=1) as response:
            return response.status < 500
    except HTTPError as exc:
        return exc.code < 500
    except (ConnectionError, TimeoutError, URLError, OSError):
        return False


def _resolve_executable(candidates: tuple[str, ...]) -> str | None:
    for executable in candidates:
        path = shutil.which(executable)
        if path is not None:
            return path
    return None


def _missing_executable_error(executable: str) -> HTTPException:
    return HTTPException(
        status_code=424,
        detail=(
            f"'{executable}' is not installed or is not on PATH. "
            "Install system dependencies with scripts/install-system-deps.sh, "
            "or edit mediaserver/config/apps.yaml to point at the correct executable."
        ),
    )


def _launch_chromium_app(url: str, app_args: list[str] | None = None) -> subprocess.Popen[bytes]:
    _require_graphical_session()
    chromium_bin = _resolve_executable(_chromium_candidates())
    if chromium_bin is None:
        raise FileNotFoundError("chromium")

    profile_dir = os.getenv("SUPERDECK_CHROMIUM_PROFILE", "/tmp/superdeck-chromium")
    extra_args = shlex.split(os.getenv("SUPERDECK_CHROMIUM_ARGS", ""))
    command = [
        chromium_bin,
        "--new-window",
        "--start-fullscreen",
        f"--user-data-dir={profile_dir}",
        f"--app={url}",
        *(app_args or []),
        *extra_args,
    ]
    return _start_process(command)


def _antimicrox_start() -> None:
    global _antimicrox_process
    if _antimicrox_process is not None and _antimicrox_process.poll() is None:
        return
    if not shutil.which("antimicrox") or not CONTROLLER_PROFILE.exists():
        return
    _antimicrox_process = subprocess.Popen(
        ["antimicrox", "--hidden", "--profile", str(CONTROLLER_PROFILE)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )


def _antimicrox_stop() -> None:
    global _antimicrox_process
    if _antimicrox_process is not None:
        _antimicrox_process.terminate()
        _antimicrox_process = None


def _chromium_candidates() -> tuple[str, ...]:
    configured = os.getenv("SUPERDECK_CHROMIUM_BIN")
    if configured:
        return (configured,)
    return CHROMIUM_CANDIDATES


def _read_cpu_temp() -> int | None:
    sensors = _resolve_executable(("sensors",))
    if sensors is None:
        return None
    try:
        result = subprocess.run(
            [sensors, "-j"],
            capture_output=True,
            text=True,
            timeout=1,
        )
        if result.returncode != 0:
            return None
        data = json.loads(result.stdout)
    except Exception:
        return None
    temps: list[float] = []
    for chip in data.values():
        if not isinstance(chip, dict):
            continue
        for section in chip.values():
            if not isinstance(section, dict):
                continue
            for key, val in section.items():
                lower = key.lower()
                if any(k in lower for k in ("core", "tctl", "tdie", "temp")) and "_input" in lower:
                    if isinstance(val, (int, float)):
                        temps.append(float(val))
    return int(max(temps)) if temps else None


def _read_gpu_stats() -> tuple[int | None, float | None]:
    nvidia_smi = _resolve_executable(("nvidia-smi",))
    if nvidia_smi is None:
        return None, None
    try:
        result = subprocess.run(
            [
                nvidia_smi,
                "--query-gpu=temperature.gpu,power.draw",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=1,
        )
        if result.returncode != 0:
            return None, None
        parts = [p.strip() for p in result.stdout.strip().split(",")]
        if len(parts) != 2:
            return None, None
        gpu_temp = None if parts[0] in ("", "[N/A]") else int(parts[0])
        gpu_power = None if parts[1] in ("", "[N/A]") else float(parts[1])
        return gpu_temp, gpu_power
    except Exception:
        return None, None


app = create_app()
