# Test file for match core functions
# This file will be run in the proper test environment with pytest
import sys
import os
# Add backend/app to path for imports
ROOT = os.path.dirname(os.path.dirname(__file__))
sys.path.insert(0, os.path.join(ROOT, 'app'))

from sqlalchemy import select
from fastapi import HTTPException

from models.match import Match
from models.user import User, RoleEnum
from schemas.match import MatchCreateRequest


async def test_post_match_to_db_success(db_session, sample_user):
    """Test posting a match to the database successfully."""
    # Create match request
    match_request = MatchCreateRequest(
        match_code="OC3_M_TEST005",
        match_name="Test Match 5",
        match_status="active"
    )
    
    from core.match import post_match_to_db
    
    response = await post_match_to_db(match_request, sample_user.user_code, db_session)
    
    assert response.status == "success"
    assert "Successfully created match" in response.message
    
    # Verify match was created in DB
    result = await db_session.execute(
        select(Match).where(Match.match_code == "OC3_M_TEST005")
    )
    match = result.scalar_one_or_none()
    assert match is not None
    assert match.match_name == "Test Match 5"
    assert match.match_status == "active"
    assert str(match.created_by) == str(sample_user.id)


async def test_get_matches_from_db(db_session, sample_user):
    """Test getting matches from the database."""
    # Create a match first
    match = Match(
        match_code="OC3_M_TEST006",
        match_name="Test Match 6",
        match_status="active",
        created_by=sample_user.id
    )
    db_session.add(match)
    await db_session.commit()
    
    from core.match import get_matches_from_db
    
    # Test getting all matches
    response = await get_matches_from_db(session=db_session)
    
    assert response.status == "success"
    assert isinstance(response.data, list)
    assert len(response.data) >= 1
    
    # Find our match in the response
    found_match = None
    for m in response.data:
        if m["match_code"] == "OC3_M_TEST006":
            found_match = m
            break
    
    assert found_match is not None
    assert found_match["match_name"] == "Test Match 6"
    assert found_match["match_status"] == "active"
    
    # Test getting match by match_code
    response = await get_matches_from_db(match_code="OC3_M_TEST006", session=db_session)
    
    assert response.status == "success"
    assert isinstance(response.data, dict)
    assert response.data["match_code"] == "OC3_M_TEST006"
    assert response.data["match_name"] == "Test Match 6"


async def test_update_match_in_db(db_session, sample_user):
    """Test updating a match in the database."""
    # Create a match first
    match = Match(
        match_code="OC3_M_TEST007",
        match_name="Original Match Name",
        match_status="active",
        created_by=sample_user.id
    )
    db_session.add(match)
    await db_session.commit()
    
    from core.match import update_match_in_db
    
    # Update the match
    update_data = {
        "match_name": "Updated Match Name",
        "match_status": "completed"
    }
    
    response = await update_match_in_db(
        match_code="OC3_M_TEST007",
        update_data=update_data,
        session=db_session
    )
    
    assert response.status == "success"
    assert "Successfully updated match" in response.message
    
    # Verify match was updated in DB
    await db_session.refresh(match)
    assert match.match_name == "Updated Match Name"
    assert match.match_status == "completed"


async def test_delete_match_from_db(db_session, sample_user):
    """Test deleting a match from the database."""
    # Create a match first
    match = Match(
        match_code="OC3_M_TEST008",
        match_name="Match to Delete",
        match_status="active",
        created_by=sample_user.id
    )
    db_session.add(match)
    await db_session.commit()
    
    from core.match import delete_match_from_db
    
    # Delete the match
    response = await delete_match_from_db(
        match_code="OC3_M_TEST008",
        session=db_session
    )
    
    assert response.status == "success"
    assert "Successfully deleted match" in response.message
    
    # Verify match was soft-deleted in DB
    result = await db_session.execute(
        select(Match).where(Match.match_code == "OC3_M_TEST008")
    )
    match = result.scalar_one_or_none()
    assert match is not None  # Still exists but marked as deleted
    assert match.is_deleted == True