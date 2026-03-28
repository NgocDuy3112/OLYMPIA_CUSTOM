# Test file for question core functions
# This file will be run in the proper test environment with pytest
import sys
import os
# Add backend/app to path for imports
ROOT = os.path.dirname(os.path.dirname(__file__))
sys.path.insert(0, os.path.join(ROOT, 'app'))

from sqlalchemy import select
from fastapi import HTTPException

from models.question import Question
from models.match import Match
from models.user import User, RoleEnum
from schemas.question import QuestionCreateRequest


async def test_post_question_to_db_success(db_session, sample_user):
    """Test posting a question to the database successfully."""
    # Create a match first
    match = Match(
        match_code="OC3_M_TEST003",
        match_name="Test Match 3",
        match_status="active",
        created_by=sample_user.id
    )
    db_session.add(match)
    await db_session.commit()
    
    # Create question request
    question_request = QuestionCreateRequest(
        question_code="OC3_Q_TEST003",
        content="Test question content?",
        answer_a="Option A",
        answer_b="Option B",
        answer_c="Option C", 
        answer_d="Option D",
        answer_e="Option E",
        answer_f="Option F",
        correct_answer="A",
        explanation="This is the explanation",
        media_url="http://example.com/image.jpg",
        match_code="OC3_M_TEST003"
    )
    
    from core.question import post_question_to_db
    
    response = await post_question_to_db(question_request, db_session)
    
    assert response.status == "success"
    assert "Successfully created question" in response.message
    
    # Verify question was created in DB
    result = await db_session.execute(
        select(Question).where(Question.question_code == "OC3_Q_TEST003")
    )
    question = result.scalar_one_or_none()
    assert question is not None
    assert question.content == "Test question content?"
    assert question.answer_a == "Option A"
    assert question.correct_answer == "A"
    assert question.explanation == "This is the explanation"


async def test_get_questions_from_db_by_match_code(db_session, sample_user):
    """Test getting questions from the database by match code."""
    # Create a match first
    match = Match(
        match_code="OC3_M_TEST004",
        match_name="Test Match 4",
        match_status="active",
        created_by=sample_user.id
    )
    db_session.add(match)
    
    # Create a question
    question = Question(
        question_code="OC3_Q_TEST004",
        content="Another test question?",
        answer_a="A",
        answer_b="B",
        answer_c="C",
        answer_d="D", 
        answer_e="E",
        answer_f="F",
        correct_answer="B",
        explanation="Another explanation",
        media_url=None,
        match_id=match.id
    )
    db_session.add(question)
    
    await db_session.commit()
    
    from core.question import get_questions_from_db
    
    response = await get_questions_from_db(
        match_code="OC3_M_TEST004",
        session=db_session
    )
    
    assert response.status == "success"
    assert isinstance(response.data, list)
    assert len(response.data) >= 1
    
    # Find our question in the response
    found_question = None
    for q in response.data:
        if q["question_code"] == "OC3_Q_TEST004":
            found_question = q
            break
    
    assert found_question is not None
    assert found_question["content"] == "Another test question?"
    assert found_question["correct_answer"] == "B"