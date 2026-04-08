"""
Load ``email_settings`` from this directory by absolute file path.

The API and the Celery worker may run with different ``cwd`` / ``sys.path``.
Plain ``import email_settings`` then fails with ``ModuleNotFoundError`` even though
``email_settings.py`` sits next to ``tasks.py``. This loader avoids that.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

_cached: object | None = None

# Unique loader name — avoids shadowing / import machinery edge cases when __name__ is "email_settings".
_MODULE_NAME = "_wejhetna_email_settings"


def get_email_settings():
    """Return the ``email_settings`` module object (cached), loaded from ``email_settings.py``."""
    global _cached
    if _cached is not None:
        return _cached

    if _MODULE_NAME in sys.modules:
        _cached = sys.modules[_MODULE_NAME]
        return _cached

    backend_dir = Path(__file__).resolve().parent
    path = backend_dir / "email_settings.py"
    if not path.is_file():
        raise ModuleNotFoundError(
            f"email_settings.py not found at {path} (check deployment layout)."
        )

    spec = importlib.util.spec_from_file_location(_MODULE_NAME, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot build import spec for {path}")

    mod = importlib.util.module_from_spec(spec)
    sys.modules[_MODULE_NAME] = mod
    spec.loader.exec_module(mod)
    _cached = mod
    return mod
