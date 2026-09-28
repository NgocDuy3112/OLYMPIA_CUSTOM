from __future__ import annotations

from enum import Enum

from pydantic import BaseModel


class StaffRole(str, Enum):
    CONTROLLER = "controller"
    MC = "mc"
    QAUTHOR = "qauthor"


class ApiRole(str, Enum):
    OPERATOR = "operator"
    ADMIN = "admin"


class UserRole(str, Enum):
    CONTROLLER = "controller"
    MC = "mc"
    QAUTHOR = "qauthor"
    OPERATOR = "operator"
    ADMIN = "admin"


class MatchInfo(BaseModel):
    matchCode: str
    phase: str | None = None
    state: dict = {}
    players: dict = {}
    scoreboard: list = []
    profiles: list = []


class QuestionMeta(BaseModel):
    questionCode: str
    content: str | None = None
    category: str | None = None
    points: int | None = None
    isUsed: bool = False


class AgentRequest(BaseModel):
    match_code: str
    question: str


class AgentResponse(BaseModel):
    answer: str
    tools_used: list[str] = []
    cached: bool = False


class AgentError(Exception):
    def __init__(self, message: str, status_code: int = 500) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
