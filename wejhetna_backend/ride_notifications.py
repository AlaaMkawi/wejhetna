"""Fire-and-forget Celery hooks after DB commits. Never blocks or fails the API."""

import logging

logger = logging.getLogger(__name__)


def enqueue_verification_code_created(ride_request_id: int) -> None:
    try:
        from celery_app import celery_app

        if celery_app is None:
            return
        celery_app.send_task("wejhetna.notify_verification_code_created", args=[ride_request_id])
    except Exception as exc:
        logger.debug("verification_code notification skipped: %s", exc)


def enqueue_ride_in_progress(ride_request_id: int) -> None:
    try:
        from celery_app import celery_app

        if celery_app is None:
            return
        celery_app.send_task("wejhetna.notify_ride_in_progress", args=[ride_request_id])
    except Exception as exc:
        logger.debug("ride_in_progress notification skipped: %s", exc)
