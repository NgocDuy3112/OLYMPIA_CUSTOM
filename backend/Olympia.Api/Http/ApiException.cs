namespace Olympia.Api.Http;

/// <summary>
/// Envelope error thrown by handlers; the global middleware turns it into the
/// Fastify-shaped body: { error, message, details? }.
/// </summary>
public sealed class ApiException : Exception
{
    public ApiException(int status, string error, string message, object? details = null)
        : base(message)
    {
        Status = status;
        Error = error;
        Details = details;
    }

    public int Status { get; }
    public string Error { get; }
    public object? Details { get; }

    public static ApiException BadRequest(string message) => new(400, "Bad Request", message);
    public static ApiException Unauthorized(string message) => new(401, "Unauthorized", message);
    public static ApiException Forbidden(string message) => new(403, "Forbidden", message);
    public static ApiException NotFound(string message) => new(404, "Not Found", message);
    public static ApiException Conflict(string message) => new(409, "Conflict", message);
    public static ApiException Unavailable(string message) => new(503, "Service Unavailable", message);
}
