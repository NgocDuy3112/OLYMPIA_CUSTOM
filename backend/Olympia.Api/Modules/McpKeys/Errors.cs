namespace Olympia.Api.Modules.McpKeys;

public enum McpKeyErrorCode
{
    VALIDATION,
    UNAUTHORIZED,
    FORBIDDEN,
    NOT_FOUND
}

public sealed class McpKeyError : Exception
{
    public McpKeyError(McpKeyErrorCode code, string message, IReadOnlyList<string>? details = null)
        : base(message)
    {
        Code = code;
        Details = details ?? [];
    }

    public McpKeyErrorCode Code { get; }
    public IReadOnlyList<string> Details { get; }

    public int Status => Code switch
    {
        McpKeyErrorCode.VALIDATION => 400,
        McpKeyErrorCode.UNAUTHORIZED => 401,
        McpKeyErrorCode.FORBIDDEN => 403,
        _ => 404
    };
}
