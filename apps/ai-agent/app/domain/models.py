"""Domain models — shared shape with packages/shared (TS)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

UserRole = Literal["controller", "mc", "question_author", "player", "spectator"]


class PlayerScore(BaseModel):
    userCode: str
    userName: str
    position: int | None = None
    score: float


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
