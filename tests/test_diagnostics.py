from __future__ import annotations

import json
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from superdeck.app import create_app


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
