namespace AOC.Api.Modules.Mcp;

public sealed class ToolError(string code, string message) : Exception(message)
{
    public string Code { get; } = code;
}

public sealed class ToolConflictError(int currentVersion)
    : Exception($"the resource moved on: current version is {currentVersion}")
{
    public int CurrentVersion { get; } = currentVersion;
}
