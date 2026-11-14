using System.Text.Json;
using AOC.Domain.Engine.Turns;

namespace AOC.Api.Modules.Live;

/// <summary>Port of live/protocol.ts — the envelope shapes pushed over SignalR.</summary>
public static class Protocol
{
    public const int Version = 1;

    public const int SessionEndedCloseCode = 4401; // session revoked / account disabled
    public const int NotSeatedCloseCode = 4403;

    private static string NowIso() => DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");

    private static Dictionary<string, object?> Envelope(string type, string? requestId, object data) => new()
    {
        ["v"] = Version,
        ["type"] = type,
        ["at"] = NowIso(),
        ["requestId"] = requestId,
        ["data"] = data
    };

    public static Dictionary<string, object?> View(object view, string? requestId = null)
        => Envelope("view", requestId, new Dictionary<string, object?> { ["view"] = view });

    public static Dictionary<string, object?> Console(object view)
        => Envelope("console", null, new Dictionary<string, object?> { ["view"] = view });

    public static Dictionary<string, object?> Ack(string forType, object? result, string? requestId = null)
        => Envelope("ack", requestId, new Dictionary<string, object?>
        {
            ["for"] = forType,
            ["result"] = result
        });

    public static Dictionary<string, object?> Error(string code, string message, string? requestId = null)
        => Envelope("error", requestId, new Dictionary<string, object?>
        {
            ["code"] = code,
            ["message"] = message
        });

    /// <summary>Client message: { v, type, requestId?, data }.</summary>
    public static (string Type, string? RequestId, JsonElement Data)? ParseClientMessage(JsonElement raw)
    {
        if (raw.ValueKind != JsonValueKind.Object) return null;
        if (!raw.TryGetProperty("v", out var v) || v.ValueKind != JsonValueKind.Number || v.GetInt32() != Version)
            return null;
        if (!raw.TryGetProperty("type", out var typeEl) || typeEl.ValueKind != JsonValueKind.String)
            return null;
        var type = typeEl.GetString()!;
        if (type is not ("answer" or "keyword" or "buzz")) return null;

        string? requestId = null;
        if (raw.TryGetProperty("requestId", out var idEl) && idEl.ValueKind == JsonValueKind.String)
            requestId = idEl.GetString();

        if (!raw.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Object)
            return null;

        return (type, requestId, data.Clone());
    }
}
