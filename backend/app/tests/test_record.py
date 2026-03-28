# Test file for record core functions
# This file will be run in the proper test environment with pytest
import sys
import os
# Add backend/app to path for imports
ROOT = os.path.dirname(os.path.dirname(__file__))
sys.path.insert(0, os.path.join(ROOT, 'app'))

from sqlalchemy import select
from fastapi import HTTPException

from models.record import Record
from models.user import User, RoleEnum
from models.match import Match
from schemas.record import RecordCreateRequest


async def test_post_record_to_db_success(db_session, sample_user):
    """Test posting a record to the database successfully."""
    # Create a match first
    match = Match(
        match_code="OC3_M_TEST009",
        match_name="Test Match 9",
        match_status="active",
        created_by=sample_user.id
    )
    db_session.add(match)
    await db_session.commit()
    
    # Create record request
    record_request = RecordCreateRequest(
        match_code="OC3_M_TEST009",
        user_code=sample_user.user_code,
        points=100,
        round_number=1,
        question_code="OC3_Q_TEST001"
    )
    
    from core.record import post_record_to_db
    from dependencies.valkey_store import get_valkey
    import valkey.asyncio
    
    # Mock valkey for the test
    valkey = valkey.asyncio.Valkey(host='localhost', port=6379, decode_responses=True)
    
    response = await post_record_to_db(record_request, db_session, valkey)
    
    assert response.status == "success"
    assert "Successfully created record" in response.message
    
    # Verify record was created in DB
    result = await db_session.execute(
        select(Record).where(
            Record.match_id == match.id,
            Record.player_id == sample_user.id
        )
    )
    record = result.scalar_one_or_none()
    assert record is not None
    assert record.points == 100
    assert record.round_number == 1
    assert record.question_code == "OC3_Q_TEST001"


async def test_get_records_from_db(db_session, sample_user):
    """Test getting records from the database."""
    # Create a match first
    match = Match(
        match_code="OC3_M_TEST010",
        match_name="Test Match 10",
        match_status="active",
        created_by=sample_user.id
    )
    db_session.add(match)
    
    # Create a record
    record = Record(
        points=200,
        round_number=2,
        question_code="OC3_Q_TEST002",
        player_id=sample_user.id,
        match_id=match.id
    )
    db_session.add(record)
    
    await db_session.commit()
    
    from core.record import get_records_from_db
    from dependencies.valkey_store import get_valkey
    import valkey.asyncio
    
    # Mock valkey for the test
    valkey = valkey.asyncio.Valkey(host='localhost', port=6399, decode_responses=True)
    
    # Test getting records by match_code and user_code
    response = await get_records_from_db(
        match_code="OC3_M_TEST010",
        user_code=sample_user.user_code,
        session=db_session,
        valkey=valkey
    )
    
    assert response.status == "success"
    assert isinstance(response.data, list)
    assert len(response.data) >= 1
    
    # Find our record in the response
    found_record = None
    for r in response.data:
        if r["question_code"] == "OC3_Q_TEST002":
            found_record = r
            break
    
    assert found_record is not None
    assert found_record["points"] == 200
    assert found_record["round_number"] == 2


async def test_update_record_in_db(db_session, sample_user):
    """Test updating a record in the database."""
    # Create a match first
    match = Match(
        match_code="OC3_M_TEST011",
        match_name="Test Match 11",
        match_status="active",
        created_by=sample_user.id
    )
    db_session.add(match)
    
    # Create a record
    record = Record(
        points=150,
        round_number=1,
        question_code="OC3_Q_TEST003",
        player_id=sample_user.id,
        match_id=match.id
    )
    db_session.add(record)
    
    await db_session.commit()
    
    from core.record import update_record_in_db
    from dependencies.valkey_store import get_valkey
    import valkey.asyncio
    
    # Mock valkey for the test
    valkey = valkey.asyncio.Valkey(host='localhost', port=6379, decode_responses=True)
    
    # Update the record
    update_data = {
        "points": 250,
        "round_number": 2
    }
    
    response = await update_record_in_db(
        match_code="OC3_M_TEST011",
        user_code=sample_user.user_code,
        question_code="OC3_Q_TEST003",
        update_data=update_data,
        session=db_session,
        valkey=valkey
    )
    
    assert response.status == "success"
    assert "Successfully updated record" in response.message
    
    # Verify record was updated in DB
    await db_session.refresh(record)
    assert record.points == 250
    assert record.round_number == 2