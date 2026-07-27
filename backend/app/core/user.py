from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException

from logger import global_logger
from models.user import User, RoleEnum
from schemas.user import *
from configs import *
from core.auth import hash_password


async def get_user_from_request_from_db(
    user_code: str | None,
    user_role: str | None,
    session: AsyncSession
) -> BaseResponse:
    global_logger.debug(f"Fetching users with user_code={user_code} user_role={user_role} from database.")
    try:
        query = select(User).where(User.is_deleted == False)

        if user_code:
            query = query.where(User.user_code == user_code)
            result = await session.execute(query)
            user = result.scalars().one_or_none()
            if user is None:
                log_message = f"No user found with user_code={user_code}."
                global_logger.warning(log_message)
                raise HTTPException(status_code=404, detail=log_message)
            user_data = {
                'user_code': user.user_code,
                'user_name': user.user_name,
                'email': user.email,
                'role': user.role.value,
                'created_at': user.created_at,
                'updated_at': user.updated_at
            }
            return BaseResponse(
                status='success',
                message=f"Fetched user with user_code={user_code}.",
                data=user_data
            )

        if user_role:
            try:
                role_enum = RoleEnum(user_role)
            except ValueError:
                valid = [r.value for r in RoleEnum]
                log_message = f"Invalid role={user_role}. Must be one of {valid}."
                global_logger.warning(log_message)
                raise HTTPException(status_code=400, detail=log_message)
            query = query.where(User.role == role_enum)

        result = await session.execute(query)
        users = result.scalars().all()
        users_data = [
            {
                'user_code': user.user_code,
                'user_name': user.user_name,
                'email': user.email,
                'role': user.role.value,
                'created_at': user.created_at,
                'updated_at': user.updated_at
            }
            for user in users
        ]
        log_message = f"Fetched {len(users)} users from database."
        global_logger.debug(log_message)
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


async def delete_user_from_db(user_code: str, session: AsyncSession) -> BaseResponse:
    global_logger.info(f"Soft deleting user with user_code={user_code} from database.")
    try:
        query = select(User).where(User.user_code == user_code, User.is_deleted == False)
        result = await session.execute(query)
        user = result.scalars().one_or_none()

        if user is None:
            log_message = f"No active user found with user_code={user_code} to delete."
            global_logger.warning(log_message)
            raise HTTPException(status_code=404, detail=log_message)

        user.is_deleted = True
        await session.commit()

        log_message = f"User with user_code={user_code} has been soft deleted successfully."
        global_logger.info(log_message)
        return BaseResponse(
            status='success',
            message=log_message
        )
    except HTTPException:
        raise
    except Exception:
        await session.rollback()
        log_message = f"An unexpected error occurred while deleting user with user_code={user_code}."
        global_logger.exception(log_message)
        raise HTTPException(status_code=500, detail=log_message)


async def patch_user_to_db(
    user_code: str,
    request: UserUpdateRequest,
    session: AsyncSession
) -> BaseResponse:
    global_logger.info(f"Updating user {user_code} in database.")
    try:
        query = select(User).where(User.user_code == user_code, User.is_deleted == False)
        result = await session.execute(query)
        user = result.scalar_one_or_none()

        if user is None:
            log_message = f"No active user found with user_code {user_code}."
            global_logger.warning(log_message)
            raise HTTPException(status_code=404, detail=log_message)

        if request.user_name is not None:
            user.user_name = request.user_name

        if request.role is not None:
            user.role = RoleEnum(request.role)

        if request.new_password is not None:
            user.hashed_password = hash_password(request.new_password)

        if request.email is not None:
            user.email = request.email if request.email.strip() else None

        await session.commit()
        log_message = f"User {user_code} updated successfully."
        global_logger.info(log_message)
        return BaseResponse(status='success', message=log_message)
    except HTTPException:
        raise
    except Exception:
        await session.rollback()
        log_message = f"An unexpected error occurred while updating user {user_code}."
        global_logger.exception(log_message)
        raise HTTPException(status_code=500, detail=log_message)
