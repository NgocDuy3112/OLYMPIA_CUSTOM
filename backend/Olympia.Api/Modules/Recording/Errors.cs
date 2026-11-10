namespace Olympia.Api.Modules.Recording;

/// <summary>A recording-shaped failure carries its own HTTP status.</summary>
public sealed class RecordingError(string message, int statusCode = 409) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}
