"""
Celery application for wejhetna_backend.

Run worker on Windows (from wejhetna_backend directory):
    celery -A celery_app worker --loglevel=info --pool=solo

After editing tasks.py, restart the worker or it will not register new/updated tasks.

Broker / result backend: Redis (defaults match local redis://localhost:6379).

Future integration points (not wired here):
- AWS S3: call boto3 inside task functions in tasks.py (or new modules imported by tasks).
- PostgreSQL: open a short-lived SessionLocal inside a task; do not share sessions across workers.
- Elasticsearch: instantiate the client inside the task or a small helper used only from tasks.
"""
import os
import sys
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from celery import Celery
from celery.signals import task_failure, task_postrun, task_prerun, worker_ready
from dotenv import load_dotenv

load_dotenv()

_DEFAULT_BROKER = "redis://localhost:6379/0"
_DEFAULT_BACKEND = "redis://localhost:6379/1"

celery_app = Celery(
    "wejhetna",
    broker=os.getenv("CELERY_BROKER_URL", _DEFAULT_BROKER),
    backend=os.getenv("CELERY_RESULT_BACKEND", _DEFAULT_BACKEND),
    include=["tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

# Import task modules here so decorators register on this interpreter (API + worker).
import tasks as _tasks_module  # noqa: F401, E402


@worker_ready.connect
def _log_registered_tasks(sender, **kwargs) -> None:
    names = sorted(
        n for n in sender.app.tasks.keys() if not n.startswith("celery.")
    )
    print(f"[celery_app] worker_ready: registered_tasks ({len(names)}) = {names}")
    if "tasks.send_email" not in names:
        print(
            "[celery_app] WARNING: tasks.send_email is NOT registered; "
            "restart the worker from wejhetna_backend after tasks.py changes "
            "(celery -A celery_app worker --pool=solo --loglevel=info)."
        )


@task_prerun.connect
def _log_task_prerun(sender=None, task_id=None, task=None, args=None, **kwargs) -> None:
    name = getattr(task, "name", None) or getattr(sender, "name", repr(sender))
    print(f"[CELERY] task_prerun (worker picked up task): id={task_id!r} name={name!r}")


@task_failure.connect
def _log_task_failure(sender=None, task_id=None, exception=None, **kwargs) -> None:
    name = getattr(sender, "name", repr(sender)) if sender is not None else "?"
    print(
        f"[CELERY] task_failure: id={task_id!r} name={name!r} exception={exception!r}"
    )


@task_postrun.connect
def _log_task_postrun(
    sender=None, task_id=None, task=None, state=None, retval=None, **kwargs
) -> None:
    """Email task completion line (avoid spamming logs for every periodic/internal task)."""
    name = getattr(task, "name", None) or getattr(sender, "name", repr(sender))
    if name != "tasks.send_email":
        return
    print(
        f"[CELERY] task_postrun (email): id={task_id!r} name={name!r} state={state!r}"
    )
