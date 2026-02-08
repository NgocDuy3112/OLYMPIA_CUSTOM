from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from logger import global_logger
from models.user import User, RoleEnum
from schemas.user import *
from configs import *


async def get_user_from_request_from_db(
    user_code: str | None,
    user_role: str | None,
    session: AsyncSession
) -> BaseResponse:
    """Fetch users from DB. Behavior:
    - If user_code is provided: return the single matching user (404 if not found).
    - Else if user_role is provided: return all users with that role.
    - Else: return all non-deleted users.
    """
    global_logger.info(f"Fetching users with user_code={user_code} user_role={user_role} from database.")
    try:
        # Base query: only non-deleted users
        query = select(User).where(User.is_deleted == False)

        # If user_code is provided, return a single user
        if user_code:
            query = query.where(User.user_code == user_code)
            result = await session.execute(query)
            user = result.scalars().one_or_none()
            if user is None:
                log_message = f"No user found with user_code={user_code}."
                global_logger.warning(log_message)
                raise HTTPException(status_code=404, detail=log_message)
            return BaseResponse(
                status='success',
                message=f"Fetched user with user_code={user_code}.",
                data=user
            )

        # If user_role is provided, validate and filter
        if user_role:
            try:
                role_enum = RoleEnum(user_role)
            except ValueError:
                valid = [r.value for r in RoleEnum]
                log_message = f"Invalid role={user_role}. Must be one of {valid}."
                global_logger.warning(log_message)
                raise HTTPException(status_code=400, detail=log_message)
            query = query.where(User.role == role_enum)

        # Execute query for multiple users
        result = await session.execute(query)
        users = result.scalars().all()
        users_data = [
            {
                'user_code': user.user_code,
                'userPname': user.user_name,
                'role': user.role.value,
                'created_at': user.created_at,
                'updated_at': user.updated_at
            }
            for user in users
        ]
        log_message = f"Fetched {len(users)} users from database."
        global_logger.info(log_message)
        return BaseResponse(
            status='success',
            message=log_message,
            data=users_data
        )
    except HTTPException:
        raise
    except Exception:
        log_message = f"An unexpected error occurred while fetching users with user_code={user_code} user_role={user_role}."
        global_logger.exception(log_message)
        raise HTTPException(
            status_code=500, detail=log_message
        )