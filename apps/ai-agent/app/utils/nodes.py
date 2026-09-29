from __future__ import annotations

from langchain.agents import create_agent
from langgraph.runtime import Runtime
from langchain_openrouter import ChatOpenRouter
from langchain_typesafe import Choice, Noul, Score, TypeSafeClassifier

from app.utils.state import *


async def task_route(state: AgentInputState) -> AgentOutputState:
    classifier = TypeSafeClassifier()
    response = classifier.invoke(
        {
            "state": state["message"][-1].content,
            "questions": {
                "team": Choice(
                    instructions="Which team should process this?",
                    criteria={
                        
                    }
                )
            }
        }
    )

    