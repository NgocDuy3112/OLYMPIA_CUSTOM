from __future__ import annotations


def test_no_internal_tools_left():
    """Không còn internal tools — agent gọi duy nhất qua MCP adapter."""
    import app.utils.tools as tools_module

    leftovers = [
        name
        for name in (
            "ToolContext",
            "TOOL_SCHEMAS",
            "WRITE_TOOLS",
            "execute_tool",
            "execute_tool_inner",
            "lc_tools",
            "QA_TOOLS",
            "BANK_TOOLS",
            "OPS_TOOLS",
        )
        if hasattr(tools_module, name)
    ]
    assert leftovers == []
