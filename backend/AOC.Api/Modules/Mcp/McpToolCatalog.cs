using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;

namespace AOC.Api.Modules.Mcp;

public sealed record McpScopesResponse(IReadOnlyList<McpScopeInfo> Scopes);

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
            true, nameof(McpTools.EligibleQuestions)),
        new(McpToolNames.CreateQuestion, McpScope.WRITE, "Create question",
            "Create a DRAFT question. `tournamentId` names a tournament you may write (owner or admin) and anchors the ownership check. `payload` carries the kind-specific body. `dryRun: true` validates and returns the row it would insert without saving it.",
            false, nameof(McpTools.CreateQuestion)),
        new(McpToolNames.UpdateQuestion, McpScope.WRITE, "Update question",
            "Patch one question. `expectedVersion` is the `version` that get_question returned (the question's updated-at in epoch milliseconds); a stale value returns {\"error\":\"CONFLICT\",\"currentVersion\":n} — re-read and retry. `dryRun: true` validates and echoes the patch it would set without saving it.",
            false, nameof(McpTools.UpdateQuestion)),
        new(McpToolNames.AssembleMatch, McpScope.WRITE, "Assemble match",
            "Replace a match's questions with `questions` (array of {sourceId, roundId, turnId, points?, position?}). `baseRevision` is the match's current assemblyRevision; a stale value returns CONFLICT with currentVersion. `dryRun: true` returns the next revision plus added/removed counts without writing.",
            false, nameof(McpTools.AssembleMatch)),
        new(McpToolNames.TransitionMatch, McpScope.WRITE, "Transition match",
            "Move a match along UPCOMING -> LIVE -> FINISHED. `expectedVersion` is the status you last read as a number (UPCOMING=0, LIVE=1, FINISHED=2); a stale value returns CONFLICT with currentVersion. `dryRun: true` reports the transition it would attempt without writing. Readiness (seats, assembled questions) is only checked by the write.",
            false, nameof(McpTools.TransitionMatch)),
        new(McpToolNames.LiveAction, McpScope.WRITE, "Live action",
            "Apply one live control action (`action` is {kind, ...fields}; every kind is listed in the aoc://catalogue resource). `expectedVersion` is the live state version you last read; a stale value returns CONFLICT with currentVersion. `dryRun: true` returns the version the action would move to without writing.",
            false, nameof(McpTools.LiveAction))
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
