using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.RateLimiting;

namespace AOC.Api.Http;

/// <summary>Shared request validation — TypeBox-style required/type checks.</summary>
public static class Validate
{
    private static readonly Regex UuidPattern =
        new("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", RegexOptions.Compiled);

    public static JsonElement Object(JsonElement body, string where = "body")
    {
        if (body.ValueKind != JsonValueKind.Object)
            throw ApiException.BadRequest($"{where} must be an object");
        return body;
    }

    public static string RequiredString(JsonElement obj, string name, int? maxLength = null,
        int? minLength = null, string where = "body", Regex? pattern = null)
    {
        if (!obj.TryGetProperty(name, out var v) || v.ValueKind != JsonValueKind.String)
            throw ApiException.BadRequest($"{where} must have required property '{name}'");
        var s = v.GetString()!;
        if (minLength is { } min && s.Length < min)
            throw ApiException.BadRequest($"{where}/{name}: String must have at least {min} characters");
        if (maxLength is { } max && s.Length > max)
            throw ApiException.BadRequest($"{where}/{name}: String must have at most {max} characters");
        if (pattern is not null && !pattern.IsMatch(s))
            throw ApiException.BadRequest($"{where}/{name}: String does not match pattern");
        return s;
    }

    public static string? OptionalString(JsonElement obj, string name, int? maxLength = null,
        string where = "body", Regex? pattern = null, bool allowNull = false, int? minLength = null)
    {
        if (!obj.TryGetProperty(name, out var v)) return null;
        if (v.ValueKind == JsonValueKind.Null)
        {
            if (allowNull) return null;
            throw ApiException.BadRequest($"{where}/{name}: Expected string");
        }
        if (v.ValueKind != JsonValueKind.String)
            throw ApiException.BadRequest($"{where}/{name}: Expected string");
        var s = v.GetString()!;
        if (minLength is { } min && s.Length < min)
            throw ApiException.BadRequest($"{where}/{name}: String must have at least {min} characters");
        if (maxLength is { } max && s.Length > max)
            throw ApiException.BadRequest($"{where}/{name}: String must have at most {max} characters");
        if (pattern is not null && !pattern.IsMatch(s))
            throw ApiException.BadRequest($"{where}/{name}: String does not match pattern");
        return s;
    }

    public static int? OptionalInt(JsonElement obj, string name, int? min = null, int? max = null, string where = "body")
    {
        if (!obj.TryGetProperty(name, out var v)) return null;
        if (v.ValueKind == JsonValueKind.Null) return null;
        if (v.ValueKind != JsonValueKind.Number || !v.TryGetInt32(out var n))
            throw ApiException.BadRequest($"{where}/{name}: Expected integer");
        if (min is { } lo && n < lo)
            throw ApiException.BadRequest($"{where}/{name}: Number must be >= {lo}");
        if (max is { } hi && n > hi)
            throw ApiException.BadRequest($"{where}/{name}: Number must be <= {hi}");
        return n;
    }

    public static int RequiredInt(JsonElement obj, string name, int? min = null, int? max = null, string where = "body")
    {
        if (!obj.TryGetProperty(name, out var v) || v.ValueKind != JsonValueKind.Number || !v.TryGetInt32(out var n))
            throw ApiException.BadRequest($"{where} must have required property '{name}'");
        if (min is { } lo && n < lo)
            throw ApiException.BadRequest($"{where}/{name}: Number must be >= {lo}");
        if (max is { } hi && n > hi)
            throw ApiException.BadRequest($"{where}/{name}: Number must be <= {hi}");
        return n;
    }

    public static bool? OptionalBool(JsonElement obj, string name, string where = "body")
    {
        if (!obj.TryGetProperty(name, out var v)) return null;
        if (v.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
            throw ApiException.BadRequest($"{where}/{name}: Expected boolean");
        return v.GetBoolean();
    }

    public static List<JsonElement> RequiredArray(JsonElement obj, string name, int? minItems = null,
        int? maxItems = null, string where = "body")
    {
        if (!obj.TryGetProperty(name, out var v) || v.ValueKind != JsonValueKind.Array)
            throw ApiException.BadRequest($"{where} must have required property '{name}'");
        var list = v.EnumerateArray().ToList();
        if (minItems is { } min && list.Count < min)
            throw ApiException.BadRequest($"{where}/{name}: Array must have at least {min} items");
        if (maxItems is { } max && list.Count > max)
            throw ApiException.BadRequest($"{where}/{name}: Array must have at most {max} items");
        return list;
    }

    public static List<JsonElement>? OptionalArray(JsonElement obj, string name, int? minItems = null,
        int? maxItems = null, string where = "body")
    {
        if (!obj.TryGetProperty(name, out var v)) return null;
        if (v.ValueKind == JsonValueKind.Null) return null;
        if (v.ValueKind != JsonValueKind.Array)
            throw ApiException.BadRequest($"{where}/{name}: Expected array");
        var list = v.EnumerateArray().ToList();
        if (minItems is { } min && list.Count < min)
            throw ApiException.BadRequest($"{where}/{name}: Array must have at least {min} items");
        if (maxItems is { } max && list.Count > max)
            throw ApiException.BadRequest($"{where}/{name}: Array must have at most {max} items");
        return list;
    }

    public static string RequiredUuid(JsonElement obj, string name, string where = "body")
    {
        var s = RequiredString(obj, name, where: where);
        if (!UuidPattern.IsMatch(s))
            throw ApiException.BadRequest($"{where}/{name}: Expected string with format 'uuid'");
        return s;
    }

    public static string? OptionalUuid(JsonElement obj, string name, string where = "body")
    {
        var s = OptionalString(obj, name, where: where, allowNull: true);
        if (s is null) return null;
        if (!UuidPattern.IsMatch(s))
            throw ApiException.BadRequest($"{where}/{name}: Expected string with format 'uuid'");
        return s;
    }

    public static string RouteUuid(HttpContext http, string name)
    {
        var raw = http.Request.RouteValues[name]?.ToString() ?? "";
        if (!UuidPattern.IsMatch(raw))
            throw ApiException.BadRequest($"{name} must match uuid pattern");
        return raw;
    }

    public static string RouteString(HttpContext http, string name)
        => http.Request.RouteValues[name]?.ToString()
           ?? throw ApiException.BadRequest($"{name} is required");

    public static async Task<JsonElement> ReadJsonBodyAsync(HttpContext http)
    {
        using var reader = new StreamReader(http.Request.Body);
        var raw = await reader.ReadToEndAsync();
        if (string.IsNullOrWhiteSpace(raw)) return default;
        try
        {
            return JsonSerializer.Deserialize<JsonElement>(raw, JsonApi.Options);
        }
        catch (JsonException)
        {
            throw ApiException.BadRequest("Invalid JSON body");
        }
    }

    public static Dictionary<string, string?> Query(HttpContext http)
        => http.Request.Query.ToDictionary(kv => kv.Key, kv => kv.Value.ToString());
}
