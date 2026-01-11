from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import jwt
from jwt import PyJWTError

from configs import AppSettings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")
settings = AppSettings()



def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_name: str = payload.get("sub")
        role: str = payload.get("role")
        if user_name is None or role is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        return {"user_name": user_name, "role": role}
    except PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


def require_roles(*allowed_roles):
    def role_checker(user: dict = Depends(get_current_user)):
        user_role = user["role"]
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user_role}' is not allowed to access this endpoint"
            )
        return user
    return role_checker



def get_ws_user(token: str) -> dict:
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])

    # Ensure player_code exists for WS usage
    user_code = payload.get("user_code")
    if not user_code:
        raise HTTPException(status_code=401, detail="Token missing user_code")

    # Optionally include role if you want WS authorization later
    return {
        "user_name": payload.get("sub"),
        "user_code": user_code,
        "role": payload.get("role", "guest"),  # default guest
    }