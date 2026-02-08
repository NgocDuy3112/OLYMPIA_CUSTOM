# Admin Dashboard API Notes

This page tracks the API contracts that power the new admin dashboard UI. Every endpoint returns the shared `BaseResponse` envelope from `backend/app/schemas/base.py`, i.e.

```json
{
  "status": "success" | "error",
  "message": string,
  "data": {...}
}
```

## Existing endpoints

| Purpose | Method & Path | Source | Response payload |
| --- | --- | --- | --- |
| Fetch match metadata | `GET /matches?match_code=OC3_MXXX` | `backend/app/api/match.py` (`get_match_by_match_code`) | `{ match_code, match_name }` |
| Fetch question detail | `GET /questions?match_code=OC3_MXXX&question_code=OC3_QYYY` | `backend/app/api/question.py` (`get_question_from_request`) | `{ question_code, content, answer, explanation, media_urls }` |

## Missing / proposed endpoints

| Needed for | Proposal | Notes |
| --- | --- | --- |
| Users list card | `GET /users` returning `List[UserSchema]` (see `backend/app/schemas/user.py`) | Current backend only exposes `/auth/signup` & `/auth/login`. Dashboard now surfaces a warning when this route is absent. |
| Auto-fill participant slots | `GET /matches/{match_code}/participants` returning `{ user_codes: string[4] }` | No router currently exposes match → player bindings. UI displays a warning until implemented. |
| Create/update participant slots | `PUT /matches/{match_code}/participants` accepting `{ match_code, user_codes: string[4] }` | Needed to persist the “Tạo phòng” form. Backend should validate prefixes `OC3_M` & `OC_U`. |
| Bulk question listing | `GET /questions?match_code=OC3_MXXX` (without `question_code`) | `core/question.py` already supports the `question_code is None` branch, but the FastAPI layer still requires `question_code`. Exposing it would let the UI render full banks instead of single-question lookups. |

Once these endpoints exist, the dashboard will automatically consume them via `frontend/src/services/adminDashboard.ts` and hide the inline warnings.
