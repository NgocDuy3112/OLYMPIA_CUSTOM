using System.Text.Json;
using System.Text.RegularExpressions;
using AOC.Api.Http;
using AOC.Domain.Contracts;

namespace AOC.Api.Modules.Matches;

public sealed record AssemblyEntry(
    string RoundId,
    string TurnId,
    string SourceId,
    int? Position,
    int? Points);

/// <summary>Port of matches/schemas.ts — payload validation with MatchError VALIDATION.</summary>
public static class MatchSchemas
{
    private static readonly Regex IsoDateTime =
        new(@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$",
            RegexOptions.Compiled);

    // Route-level schema failures surface as Fastify's ajv shape:
    // { statusCode: 400, error: "Bad Request", message }.
    public static ApiException Invalid(IEnumerable<string> details)
        => ApiException.BadRequest(details.FirstOrDefault() ?? "validation failed");

    private static void Check(Func<string?> fail)
    {
        var message = fail();
        if (message is not null) throw Invalid([message]);
    }

    public static List<AssemblyEntry> ParseAssemblyEntries(JsonElement? arr)
    {
        var result = new List<AssemblyEntry>();
        if (arr is null || arr.Value.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null)
            return result;
        if (arr.Value.ValueKind != JsonValueKind.Array) throw Invalid(["<root>: Expected array"]);

        var index = 0;
        foreach (var el in arr.Value.EnumerateArray())
        {
            if (el.ValueKind != JsonValueKind.Object) throw Invalid([$"/{index}: Expected object"]);
            var where = $"/{index}";

            var roundId = Validate.RequiredString(el, "roundId", minLength: 1, where: where);
            var turnId = Validate.RequiredString(el, "turnId", minLength: 1, where: where);
            var sourceId = Validate.RequiredUuid(el, "sourceId", where: where);
            var position = Validate.OptionalInt(el, "position", min: 0, where: where);
            var points = Validate.OptionalInt(el, "points", where: where);

            result.Add(new AssemblyEntry(roundId, turnId, sourceId, position, points));
            index++;
        }
        return result;
    }

    public sealed record CreateMatchInput(
        string? Kind,
        string StageId,
        int? Slot,
        string Label,
        string ScheduledAt,
        List<Seat>? Players,
        Dictionary<string, RoundConfig>? RoundConfigs,
        List<AssemblyEntry>? Questions);

    public static CreateMatchInput ParseCreate(JsonElement input)
    {
        var details = new List<string>();
        if (input.ValueKind != JsonValueKind.Object) throw Invalid(["<root>: Expected object"]);

        var kind = Validate.OptionalString(input, "kind", where: "body");
        if (kind is not null && kind != "STANDARD") details.Add("/kind: Expected union value");

        string stageId;
        string label;
        string scheduledAt;
        try
        {
            stageId = Validate.RequiredString(input, "stageId", minLength: 1);
            label = Validate.RequiredString(input, "label", minLength: 1);
            scheduledAt = Validate.RequiredString(input, "scheduledAt");
            if (!IsoDateTime.IsMatch(scheduledAt))
                details.Add("/scheduledAt: Expected string with format 'date-time'");
        }
        catch (ApiException ex)
        {
            details.Add(ex.Message);
            throw Invalid(details);
        }

        var slot = Validate.OptionalInt(input, "slot", min: 1);

        List<Seat>? players = null;
        if (input.TryGetProperty("players", out var p) && p.ValueKind != JsonValueKind.Null)
        {
            try
            {
                players = p.Deserialize<List<Seat>>(JsonApi.Options);
                if (players is null) throw new JsonException();
                foreach (var seat in players)
                    if (seat.Kind != "user" || !Guid.TryParse(seat.UserId, out _))
                        details.Add("/players: Seat failed validation");
            }
            catch (JsonException)
            {
                details.Add("/players: Expected array of seats");
            }
        }

        Dictionary<string, RoundConfig>? roundConfigs = null;
        if (input.TryGetProperty("roundConfigs", out var rc) && rc.ValueKind != JsonValueKind.Null)
        {
            try
            {
                roundConfigs = rc.Deserialize<Dictionary<string, RoundConfig>>(JsonApi.Options);
                if (roundConfigs is null) throw new JsonException();
            }
            catch (JsonException ex)
            {
                details.Add($"/roundConfigs: {ex.Message}");
            }
        }

        List<AssemblyEntry>? questions = null;
        if (input.TryGetProperty("questions", out _))
        {
            try
            {
                questions = ParseAssemblyEntries(input.GetProperty("questions"));
            }
            catch (MatchError ex)
            {
                details.AddRange(ex.Details);
            }
        }

        if (details.Count > 0) throw Invalid(details);
        return new CreateMatchInput(kind, stageId, slot, label, scheduledAt, players, roundConfigs, questions);
    }

    public sealed record UpdateMatchInput(
        string? StageId,
        string? Label,
        string? ScheduledAt,
        List<Seat>? Players,
        Dictionary<string, RoundConfig>? RoundConfigs,
        bool HasStageId,
        bool HasLabel,
        bool HasScheduledAt,
        bool HasPlayers,
        bool HasRoundConfigs);

    public static UpdateMatchInput ParseUpdate(JsonElement input)
    {
        if (input.ValueKind != JsonValueKind.Object) throw Invalid(["<root>: Expected object"]);
        var details = new List<string>();

        string? stageId = null;
        if (input.TryGetProperty("stageId", out _))
            stageId = Validate.RequiredString(input, "stageId", minLength: 1);

        string? label = null;
        if (input.TryGetProperty("label", out _))
            label = Validate.RequiredString(input, "label", minLength: 1);

        string? scheduledAt = null;
        if (input.TryGetProperty("scheduledAt", out _))
        {
            scheduledAt = Validate.RequiredString(input, "scheduledAt");
            if (!IsoDateTime.IsMatch(scheduledAt))
                details.Add("/scheduledAt: Expected string with format 'date-time'");
        }

        List<Seat>? players = null;
        var hasPlayers = input.TryGetProperty("players", out var p);
        if (hasPlayers && p.ValueKind != JsonValueKind.Null)
        {
            try
            {
                players = p.Deserialize<List<Seat>>(JsonApi.Options);
                if (players is null) throw new JsonException();
            }
            catch (JsonException)
            {
                details.Add("/players: Expected array of seats");
            }
        }

        Dictionary<string, RoundConfig>? roundConfigs = null;
        var hasRoundConfigs = input.TryGetProperty("roundConfigs", out var rc);
        if (hasRoundConfigs && rc.ValueKind != JsonValueKind.Null)
        {
            try
            {
                roundConfigs = rc.Deserialize<Dictionary<string, RoundConfig>>(JsonApi.Options);
                if (roundConfigs is null) throw new JsonException();
            }
            catch (JsonException ex)
            {
                details.Add($"/roundConfigs: {ex.Message}");
            }
        }

        if (details.Count > 0) throw Invalid(details);
        return new UpdateMatchInput(stageId, label, scheduledAt, players, roundConfigs,
            input.TryGetProperty("stageId", out _),
            input.TryGetProperty("label", out _),
            input.TryGetProperty("scheduledAt", out _),
            hasPlayers, hasRoundConfigs);
    }

    public static List<AssemblyEntry> ParseAssemble(JsonElement input)
    {
        if (input.ValueKind != JsonValueKind.Object) throw Invalid(["<root>: Expected object"]);
        if (!input.TryGetProperty("questions", out var q)) return [];
        return ParseAssemblyEntries(q);
    }

    public static string ParseTransition(JsonElement input)
    {
        if (input.ValueKind != JsonValueKind.Object) throw Invalid(["<root>: Expected object"]);
        var status = Validate.RequiredString(input, "status");
        if (status is not ("UPCOMING" or "LIVE" or "FINISHED"))
            throw Invalid(["/status: Expected union value"]);
        return status;
    }

    public sealed record SetResultsInput(List<(string UserId, int Score)> Totals);

    public static SetResultsInput ParseSetResults(JsonElement input)
    {
        if (input.ValueKind != JsonValueKind.Object) throw Invalid(["<root>: Expected object"]);
        var totals = Validate.RequiredArray(input, "totals", minItems: 1);
        var result = new List<(string, int)>();
        var index = 0;
        foreach (var row in totals)
        {
            if (row.ValueKind != JsonValueKind.Object) throw Invalid([$"/{index}: Expected object"]);
            var userId = Validate.RequiredUuid(row, "userId", where: $"/{index}");
            var score = Validate.RequiredInt(row, "score", where: $"/{index}");
            result.Add((userId, score));
            index++;
        }
        return new SetResultsInput(result);
    }

    /// <summary>Patch-assemble body (matches/assemble-patch.ts).</summary>
    public sealed record PatchAssembleInput(int BaseRevision, List<AssemblyEntry> Questions);

    public static PatchAssembleInput ParsePatchAssemble(JsonElement input)
    {
        if (input.ValueKind != JsonValueKind.Object) throw Invalid(["<root>: Expected object"]);
        var baseRevision = Validate.RequiredInt(input, "baseRevision", min: 0);
        var questions = input.TryGetProperty("questions", out var q)
            ? ParseAssemblyEntries(q)
            : [];
        return new PatchAssembleInput(baseRevision, questions);
    }
}
