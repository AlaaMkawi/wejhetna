"""
Optional Celery app for background notifications. Core ride logic stays synchronous in FastAPI.

Set CELERY_BROKER_URL (e.g. redis://localhost:6379/0) to enable. If unset, tasks are not registered.
Run worker: celery -A celery_app worker --loglevel=info
"""

import logging
import os
from typing import Optional

from celery import Celery

logger = logging.getLogger(__name__)

broker = os.getenv("CELERY_BROKER_URL", "").strip()
celery_app: Optional[Celery] = None

if broker:
    celery_app = Celery("wejhetna", broker=broker)
    celery_app.conf.update(
        task_serializer="json",
        accept_content=["json"],
        result_serializer="json",
        timezone="UTC",
        enable_utc=True,
    )

    @celery_app.task(name="wejhetna.notify_verification_code_created", ignore_result=True)
    def notify_verification_code_created(ride_request_id: int) -> None:
        logger.info("notify_verification_code_created ride_request_id=%s", ride_request_id)

    @celery_app.task(name="wejhetna.notify_ride_in_progress", ignore_result=True)
    def notify_ride_in_progress(ride_request_id: int) -> None:
        logger.info("notify_ride_in_progress ride_request_id=%s", ride_request_id)
