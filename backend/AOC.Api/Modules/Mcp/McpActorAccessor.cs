namespace AOC.Api.Modules.Mcp;

public static class McpActorAccessor
{
    public const string ItemKey = "mcpActor";

    public static McpActor Require(HttpContext http)
        => http.Items.TryGetValue(ItemKey, out var value) && value is McpActor actor
            ? actor
            : throw new ToolError("UNAUTHORIZED", "Missing MCP authentication context");

    public static void RequireScope(McpActor actor, string scope)
    {
        if (!actor.Scopes.Contains(scope))
            throw new ToolError("FORBIDDEN", $"Missing scope: {scope}");
    }
}
