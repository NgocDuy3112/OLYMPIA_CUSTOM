using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;

namespace AOC.Api.Modules.Mcp;

public sealed record McpToolDescriptor(
    string Name,
    McpScope Scope,
    string Title,
    string Description,
    bool ReadOnly,
    string MethodName);

public static class McpToolCatalog
{
    public static IReadOnlyList<McpToolDescriptor> Tools { get; } =
    [
        new(McpToolNames.ListQuestions, McpScope.READ, "List questions",
            "List questions visible to operators: PUBLISHED and ARCHIVED. Answers are included. `usable` is true only for PUBLISHED questions.",
            true, nameof(McpTools.ListQuestions)),
        new(McpToolNames.GetQuestion, McpScope.READ, "Get question",
            "Fetch one question visible to operators (PUBLISHED or ARCHIVED). Answers are included.",
            true, nameof(McpTools.GetQuestion)),
        new(McpToolNames.EligibleQuestions, McpScope.READ, "Eligible questions",
            "Browse the pool a match may draw from: the PUBLISHED questions (narrow with `kind`). Use this for assembly. Unlike list_questions, ARCHIVED is excluded.",
            true, nameof(McpTools.EligibleQuestions))
    ];

    public static IReadOnlyList<McpServerTool> BuildTools(
        Func<RequestContext<CallToolRequestParams>, object> factory)
        => Tools.Select(descriptor => McpServerTool.Create(
            typeof(McpTools).GetMethod(descriptor.MethodName)!,
            factory,
            new McpServerToolCreateOptions
            {
                Name = descriptor.Name,
                Title = descriptor.Title,
                Description = descriptor.Description,
                ReadOnly = descriptor.ReadOnly,
                Idempotent = descriptor.ReadOnly,
                Destructive = !descriptor.ReadOnly,
                OpenWorld = false
            })).ToList();

    public static IReadOnlyList<McpScopeInfo> Scopes()
        => Enum.GetValues<McpScope>()
            .Select(scope => new McpScopeInfo(
                scope.ToString(),
                TitleOf(scope),
                McpToolScope.All
                    .Where(entry => entry.Value == scope)
                    .Select(entry => entry.Key)
                    .Order(StringComparer.Ordinal)
                    .ToList(),
                scope == McpScope.READ))
            .ToList();

    private static string TitleOf(McpScope scope) => scope switch
    {
        McpScope.READ => "Read the question bank",
        McpScope.WRITE => "Author questions and drive matches",
        McpScope.ANNOUNCE => "Announce to the audience (reserved)",
        _ => scope.ToString()
    };
}
