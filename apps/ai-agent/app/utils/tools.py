"""Internal tools đã xóa — agent gọi tools duy nhất qua MCP adapter.

Giữ lại tool_result_message cho synthesize() gom kết quả vào prompt.
System prompt theo task nằm ở nodes.scope_for_task (prompts/*.txt ở root).
"""

from __future__ import annotations

import json
from typing import Any


def tool_result_message(name: str, result: Any) -> dict:
    try:
        content = json.dumps(result, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        content = str(result)
    return {"role": "tool", "name": name, "content": content}
