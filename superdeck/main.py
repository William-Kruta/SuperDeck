from __future__ import annotations

import argparse
import os

import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the SuperDeck console shell.")
    parser.add_argument("--host", default=os.getenv("SUPERDECK_HOST", "127.0.0.1"))
    parser.add_argument(
        "--port", type=int, default=int(os.getenv("SUPERDECK_PORT", "8085"))
    )
    parser.add_argument(
        "--reload", action="store_true", help="Reload the server when files change."
    )
    args = parser.parse_args()

    uvicorn.run(
        "superdeck.app:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
    )
