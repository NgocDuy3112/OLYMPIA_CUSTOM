# Test file for answer core functions
# This file will be run in the proper test environment with pytest
import sys
import os
# Add backend/app to path for imports
ROOT = os.path.dirname(os.path.dirname(__file__))
sys.path.insert(0, os.path.join(ROOT, 'app'))

from sqlalchemy import select
from fastapi import HTTPException

from models.answer import Answer
from models.user import User, RoleEnum
from models.question import Question
from models.match import Match
from schemas.answer import AnswerPostRequest


async def test_post_answer_to_db_success(db_session, sample_user):
    """Test posting an answer to the database successfully."""
    # Create required related objects
    match = Match(
        match_code="OC3_M_TEST001",
        match_name="Test Match",
        match_status="active",
        created_by=sample_user.id
    )
    db_session.add(match)
    
    question = Question(
        question_code="OC3_Q_TEST001",
        content="Test question?",
        answer_a="A",
        answer_b="B", 
        answer_c="C",
        answer_d="D",
        answer_e="E",
        answer_f="F",
        correct_answer="A",
        explanation="Explanation",
        media_url=None
    )
    db_session.add(question)
    
    await db_session.commit()
    
    # Create answer request
    answer_request = AnswerPostRequest(
        question_code="OC3_Q_TEST001",
        match_code="OC3_M_TEST001", 
        user_code=sample_user.user_code,
        answer_text="Test answer",
        has_buzzed=False,
        timestamp=123.45
    )
    
    from core.answer import post_answer_to_db
    from dependencies.valkey_store import get_valkey
    import valkey.asyncio
    
    # Mock valkey for the test
    valkey = valkey.asyncio.Valkey(host='localhost', port=6379, decode_responses=True)
    
    response = await post_answer_to_db(answer_request, db_session, valkey)
    
    assert response.status == "success"
    assert "Successfully created answer" in response.message
    
    # Verify answer was created in DB
    result = await db_session.execute(
        select(Answer).where(
            Answer.match_id == match.id,
            Answer.player_id == sample_user.id,
            Answer.question_id == question.id
        )
    )
    answer = result.scalar_one_or_none()
    assert answer is not None
    assert answer.answer_text == "Test answer"
    assert answer.has_buzzed == False
    assert answer.timestamp == 123.45


async def test_get_answer_from_db_success(db_session, sample_user):
    """Test getting an answer from the database successfully."""
    # First create a match, question, and answer
    match = Match(
        match_code="OC3_M_TEST002",
        match_name="Test Match 2",
        match_status="active",
        created_by=sample_user.id
    )
    db_session.add(match)
    
    question = Question(
        question_code="OC3_Q_TEST002",
        content="Test question 2?",
        answer_a="A",
        answer_b="B", 
        answer_c="C",
        answer_d="D",
        answer_e="E",
        answer_f="F",
        correct_answer="B",
        explanation="Explanation 2",
        media_url=None
    )
    db_session.add(question)
    
    answer = Answer(
        answer_text="Test answer 2",
        has_buzzed=True,
        timestamp=456.78,
        player_id=sample_user.id,
        match_id=match.id,
        question_id=question.id
    )
    db_session.add(answer)
    
    await db_session.commit()
    
    from core.answer import get_answer_from_db
    from dependencies.valkey_store import get_valkey
    import valkey.asyncio
    
    # Mock valkey for the test
    valkey = valkey.asyncio.Valkey(host='localhost', port=6379, decode_responses=True)
    
    response = await get_answer_from_db(
        match_code="OC3_M_TEST002",
        user_code=sample_user.user_code,
        question_code="OC3_Q_TEST002",
        session=db_session,
        valkey=valkey
    )
    
    assert response.status == "success"
    assert response.data["match_code"] == "OC3_M_TEST002"
    assert response.data["user_code"] == sample_user.user_code
    assert response.data["question_code"] == "OC3_Q_TEST002"
    assert response.data["answer_text"] == "Test answer 2"
    assert response.data["has_buzzed"] == True
    assert response.data["timestamp"] == 456.78