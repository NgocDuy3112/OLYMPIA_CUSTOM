from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
import jwt
from jwt import PyJWTError

from configs import AppSettings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")
settings = AppSettings()



def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_name: str = payload.get("user_name")
        user_code: str = payload.get("user_code")
        role: str = payload.get("role")
        if user_name is None or user_code is None or role is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return {"user_name": user_name, "user_code": user_code, "role": role}
    except PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


def require_roles(*allowed_roles):
    if len(allowed_roles) == 1 and isinstance(allowed_roles[0], (list, tuple, set)):
        normalized_roles = set(allowed_roles[0])
    else:
        normalized_roles = set(allowed_roles)

    def role_checker(user: dict = Depends(get_current_user)):
        user_role = user["role"]
        if user_role not in normalized_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Role '{user_role}' is not allowed to access this endpoint"
            )
        return user

    return role_checker



def get_ws_user(token: str) -> dict:
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])

    user_name = payload.get("user_name")
    if not user_name:
        raise HTTPException(status_code=401, detail="Token missing user_name")
    user_code = payload.get("user_code")
    if not user_code:
        raise HTTPException(status_code=401, detail="Token missing user_code")
    role = payload.get("role")
    if not role:
        raise HTTPException(status_code=401, detail="Token missing role")

    return {
        "user_name": user_name,
        "user_code": user_code,
        "role": role
    }