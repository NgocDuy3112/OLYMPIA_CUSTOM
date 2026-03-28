# Test file for user model and related functions
# This file will be run in the proper test environment with pytest
import sys
import os
# Add backend/app to path for imports
ROOT = os.path.dirname(os.path.dirname(__file__))
sys.path.insert(0, os.path.join(ROOT, 'app'))

from sqlalchemy import select
from fastapi import HTTPException

from models.user import User, RoleEnum
from schemas.user import UserCreate, UserUpdateRequest


async def test_user_creation(db_session, mock_user_data):
    """Test creating a user."""
    user = User(
        user_name=mock_user_data["user_name"],
        user_code=mock_user_data["user_code"],
        hashed_password="hashed_password",
        email=mock_user_data["email"],
        role=RoleEnum.player
    )
    
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    
    assert user.user_name == mock_user_data["user_name"]
    assert user.user_code == mock_user_data["user_code"]
    assert user.email == mock_user_data["email"]
    assert user.role == RoleEnum.player
    assert user.is_deleted == False
    
async def test_user_role_enum_values():
    """Test that RoleEnum has the expected values."""
    assert RoleEnum.guest.value == "guest"
    assert RoleEnum.player.value == "player"
    assert RoleEnum.mc.value == "mc"
    assert RoleEnum.admin.value == "admin"
    
    # Test all possible values
    all_roles = [role.value for role in RoleEnum]
    expected_roles = ["guest", "player", "mc", "admin"]
    assert set(all_roles) == set(expected_roles)