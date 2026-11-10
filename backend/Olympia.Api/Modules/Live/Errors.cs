using System.Text.Json;
using Olympia.Api.Http;
using Olympia.Domain.Engine;

namespace Olympia.Api.Modules.Live;

/// <summary>Port of live/conflict.ts.</summary>
public sealed class LiveConflictError(int expectedVersion, int currentVersion)
    : Exception(
        $"state is out of date: you acted on version {expectedVersion}, " +
        $"current is {currentVersion}. Reload and retry.")
{
    public int ExpectedVersion { get; } = expectedVersion;
    public int CurrentVersion { get; } = currentVersion;

    public static void AssertVersion(int expected, int current)
    {
        if (expected < 0)
            throw new ArgumentOutOfRangeException(nameof(expected),
                $"expected version must be a non-negative integer, got {expected}");
        if (expected != current)
            throw new LiveConflictError(expected, current);
    }
}

/// <summary>Port of live/submit.ts SubmitError — carries its own status + code.</summary>
public sealed class SubmitError(int status, string code, string message) : Exception(message)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
}

/// <summary>Port of live/state.ts LiveStateError.</summary>
public sealed class LiveStateError(string message, IReadOnlyList<string>? details = null) : Exception(message)
{
    public IReadOnlyList<string> Details { get; } = details ?? [];
}

/// <summary>Port of live/store.ts LiveNotFoundError.</summary>
public sealed class LiveNotFoundError(string matchId)
    : Exception($"no live round for match {matchId}");

/// <summary>Helpers to validate stored live state the way the TypeBox schemas did.</summary>
public static class StateGuard
{
    public static void RequireObject(JsonElement? el, string path, List<string> details)
    {
        if (el is not { ValueKind: JsonValueKind.Object })
            details.Add($"{path}: expected object");
    }

    public static void RequireString(JsonElement obj, string name, List<string> details, string path = "")
    {
        if (!obj.TryGetProperty(name, out var v) || v.ValueKind != JsonValueKind.String)
            details.Add($"{Join(path, name)}: expected string");
    }

    public static void RequireNullableString(JsonElement obj, string name, List<string> details, string path = "")
    {
        if (!obj.TryGetProperty(name, out var v)
            || (v.ValueKind != JsonValueKind.String && v.ValueKind != JsonValueKind.Null))
            details.Add($"{Join(path, name)}: expected string or null");
    }

    public static void RequireOptionalString(JsonElement obj, string name, List<string> details, string path = "")
    {
        if (obj.TryGetProperty(name, out var v)
            && v.ValueKind != JsonValueKind.String && v.ValueKind != JsonValueKind.Null)
            details.Add($"{Join(path, name)}: expected string or null");
    }

    public static void RequireNumber(JsonElement obj, string name, List<string> details, string path = "", bool integer = false)
    {
        if (!obj.TryGetProperty(name, out var v) || v.ValueKind != JsonValueKind.Number
            || (integer && !v.TryGetInt32(out _)))
            details.Add($"{Join(path, name)}: expected {(integer ? "integer" : "number")}");
    }

    public static void RequireInteger(JsonElement obj, string name, List<string> details, string path = "")
        => RequireNumber(obj, name, details, path, integer: true);

    public static void RequireBoolean(JsonElement obj, string name, List<string> details, string path = "")
    {
        if (!obj.TryGetProperty(name, out var v) || v.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
            details.Add($"{Join(path, name)}: expected boolean");
    }

    public static void RequireOptionalBoolean(JsonElement obj, string name, List<string> details, string path = "")
    {
        if (obj.TryGetProperty(name, out var v)
            && v.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
            details.Add($"{Join(path, name)}: expected boolean");
    }

    public static void RequireArray(JsonElement obj, string name, List<string> details, string path = "")
    {
        if (!obj.TryGetProperty(name, out var v) || v.ValueKind != JsonValueKind.Array)
            details.Add($"{Join(path, name)}: expected array");
    }

    public static void RequireObjectProp(JsonElement obj, string name, List<string> details, string path = "")
    {
        if (!obj.TryGetProperty(name, out var v) || v.ValueKind != JsonValueKind.Object)
            details.Add($"{Join(path, name)}: expected object");
    }

    public static void RequireNullableObject(JsonElement obj, string name, List<string> details, string path = "")
    {
        if (!obj.TryGetProperty(name, out var v)
            || (v.ValueKind != JsonValueKind.Object && v.ValueKind != JsonValueKind.Null))
            details.Add($"{Join(path, name)}: expected object or null");
    }

    public static void RequireOptionalObjectOrArray(JsonElement obj, string name, List<string> details, string path = "")
    {
        if (obj.TryGetProperty(name, out var v)
            && v.ValueKind is not (JsonValueKind.Object or JsonValueKind.Array or JsonValueKind.Null))
            details.Add($"{Join(path, name)}: expected object/array or null");
    }

    public static void RequireOneOf(JsonElement obj, string name, string[] allowed, List<string> details, string path = "")
    {
        if (!obj.TryGetProperty(name, out var v) || v.ValueKind != JsonValueKind.String
            || !allowed.Contains(v.GetString()!))
            details.Add($"{Join(path, name)}: expected one of {string.Join(", ", allowed)}");
    }

    public static void RequireOptionalOneOf(JsonElement obj, string name, string[] allowed, List<string> details, string path = "")
    {
        if (obj.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String
            && !allowed.Contains(v.GetString()!))
            details.Add($"{Join(path, name)}: expected one of {string.Join(", ", allowed)}");
    }

    /// <summary>Validate + deserialize, wrapping failures as LiveStateError like TypeBox did.</summary>
    public static T Parse<T>(JsonElement raw, string label, Action<JsonElement, List<string>> validate,
        JsonElement? archiveDefault = null)
    {
        var details = new List<string>();
        if (raw.ValueKind != JsonValueKind.Object)
            details.Add("<root>: expected object");
        else
            validate(raw, details);

        if (details.Count > 0)
            throw new LiveStateError($"stored live state failed validation", details.Take(5).ToList());

        try
        {
            return JsonSerializer.Deserialize<T>(raw, JsonApi.Options)!;
        }
        catch (JsonException ex)
        {
            throw new LiveStateError("stored live state failed validation",
                new[] { $"<root>: {ex.Message}" });
        }
    }

    private static string Join(string path, string name) => path.Length == 0 ? name : $"{path}.{name}";
}
