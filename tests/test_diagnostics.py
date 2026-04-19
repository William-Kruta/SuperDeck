from __future__ import annotations

import json
import subprocess
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from superdeck.app import _read_gpu_stats, create_app


@pytest.fixture()
def client():
    return TestClient(create_app())


def test_diagnostics_returns_200(client):
    with patch("superdeck.app._read_cpu_temp", return_value=52), \
         patch("superdeck.app._read_gpu_stats", return_value=(48, 42.5)):
        resp = client.get("/api/diagnostics")
    assert resp.status_code == 200
    data = resp.json()
    assert data["cpu_temp"] == 52
    assert data["gpu_temp"] == 48
    assert data["gpu_power_w"] == 42.5


def test_diagnostics_nulls_when_tools_missing(client):
    with patch("superdeck.app._read_cpu_temp", return_value=None), \
         patch("superdeck.app._read_gpu_stats", return_value=(None, None)):
        resp = client.get("/api/diagnostics")
    assert resp.status_code == 200
    data = resp.json()
    assert data["cpu_temp"] is None
    assert data["gpu_temp"] is None
    assert data["gpu_power_w"] is None


def test_gpu_stats_handles_multiple_nvidia_gpus():
    result = subprocess.CompletedProcess(
        args=["nvidia-smi"],
        returncode=0,
        stdout="48, 42.5\n71, 87.2\n",
        stderr="",
    )
    with patch("superdeck.app._resolve_executable", return_value="/usr/bin/nvidia-smi"), \
         patch("superdeck.app.subprocess.run", return_value=result):
        assert _read_gpu_stats() == (71, 129.7)


def test_gpu_stats_falls_back_to_sensors_json():
    sensors_output = {
        "amdgpu-pci-0300": {
            "edge": {"temp1_input": 52.0},
            "junction": {"temp2_input": 64.0},
            "PPT": {"power1_average": 37.6},
        },
        "coretemp-isa-0000": {
            "Package id 0": {"temp1_input": 75.0},
        },
    }
    result = subprocess.CompletedProcess(
        args=["sensors", "-j"],
        returncode=0,
        stdout=json.dumps(sensors_output),
        stderr="",
    )
    with patch("superdeck.app._resolve_executable", side_effect=[None, "/usr/bin/sensors"]), \
         patch("superdeck.app.subprocess.run", return_value=result):
        assert _read_gpu_stats() == (64, 37.6)
