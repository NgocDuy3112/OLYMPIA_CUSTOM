from __future__ import annotations

from app.domain.models import UserRole


def strip_answers_for_role(questions: list[dict], role: UserRole) -> list[dict]:
    """Role filter: only staff (operator/admin + controller/mc/qauthor scopes) see answers."""
    if role in ("operator", "admin", "controller", "mc", "qauthor"):
        return questions
    stripped = []
    for q in questions:
        copy = {k: v for k, v in q.items() if k not in ("answer",)}
        if copy.get("explanation"):
            copy["explanation"] = None
        stripped.append(copy)
    return stripped
