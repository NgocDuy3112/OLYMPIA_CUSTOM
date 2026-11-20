namespace AOC.Api.Modules.Mcp;

public sealed class ToolError(string code, string message) : Exception(message)
{
    public string Code { get; } = code;
}
