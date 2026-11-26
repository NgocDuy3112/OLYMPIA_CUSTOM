namespace AOC.Api.Modules.Mcp;

public enum McpScope
{
    READ,
    WRITE,
    ANNOUNCE
}

public sealed record McpScopeInfo(string Id, string Title, IReadOnlyList<string> Tools, bool Default);

public static class McpToolNames
{
    public const string ListQuestions = "list_questions";
    public const string GetQuestion = "get_question";
    public const string EligibleQuestions = "eligible_questions";
    public const string CreateQuestion = "create_question";
    public const string UpdateQuestion = "update_question";
    public const string AssembleMatch = "assemble_match";
    public const string TransitionMatch = "transition_match";
    public const string LiveAction = "live_action";
    public const string Announce = "announce";
}

public static class McpToolScope
{
    private static readonly Dictionary<string, McpScope> Required = new()
    {
        [McpToolNames.ListQuestions] = McpScope.READ,
        [McpToolNames.GetQuestion] = McpScope.READ,
        [McpToolNames.EligibleQuestions] = McpScope.READ,
        [McpToolNames.CreateQuestion] = McpScope.WRITE,
        [McpToolNames.UpdateQuestion] = McpScope.WRITE,
        [McpToolNames.AssembleMatch] = McpScope.WRITE,
        [McpToolNames.TransitionMatch] = McpScope.WRITE,
        [McpToolNames.LiveAction] = McpScope.WRITE,
        [McpToolNames.Announce] = McpScope.ANNOUNCE
    };

    public static IReadOnlyDictionary<string, McpScope> All => Required;

    public static IReadOnlyList<McpScope> ReservedScopes { get; } = [McpScope.ANNOUNCE];

    public static McpScope ScopeOf(string tool)
        => Required.TryGetValue(tool, out var scope)
            ? scope
            : throw new InvalidOperationException($"MCP tool \"{tool}\" has no scope in the table");

    public static void RequireTool(McpActor actor, string tool)
    {
        var scope = ScopeOf(tool);
        if (!actor.Scopes.Contains(scope.ToString()))
            throw new ToolError("FORBIDDEN", $"Missing scope: {scope}");
    }
}
