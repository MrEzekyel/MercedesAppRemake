"""Avvio del backend."""

from __future__ import annotations

import logging

import uvicorn

from .config import settings


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
    )
    uvicorn.run("app.api:app", host=settings.api_host, port=settings.api_port)


if __name__ == "__main__":
    main()
