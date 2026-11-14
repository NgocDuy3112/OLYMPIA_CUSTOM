using AOC.Api.Http;
using AOC.Domain.Contracts;
using AOC.Domain.Engine;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Matches;

/// <summary>Port of matches/rounds.ts.</summary>
public static class MatchRounds
{
    public static List<string> OrderedMatchRounds(
        IEnumerable<TournamentRound> tournamentRounds,
        IReadOnlyDictionary<string, RoundConfig> roundConfigs)
    {
        return tournamentRounds
            .OrderBy(r => r.Order)
            .Where(r => roundConfigs.ContainsKey(r.Id) || AocRulebook.IsAocRound(r.Id))
            .Select(r => r.Id)
            .ToList();
    }

    public static string? NextRoundId(IReadOnlyList<string> ordered, string? current)
    {
        if (current is null) return ordered.Count > 0 ? ordered[0] : null;
        var index = ordered.ToList().IndexOf(current);
        if (index == -1) return null;
        return index + 1 < ordered.Count ? ordered[index + 1] : null;
    }
}

/// <summary>Port of matches/seats.ts.</summary>
public static class MatchSeats
{
    public static bool IsSeatedInMatch(IEnumerable<Seat> seats, Guid userId)
        => seats.Any(seat => seat.Kind == "user" && Guid.TryParse(seat.UserId, out var id) && id == userId);

    public static bool IsSeatedInMatch(IEnumerable<Seat> seats, string userId)
        => seats.Any(seat => seat.Kind == "user" && seat.UserId == userId);
}

/// <summary>Port of matches/stage-inputs.ts.</summary>
public static class StageInputs
{
    public static Dictionary<string, RoundConfig> TournamentRoundConfigs(TournamentEntity tournament)
    {
        var resolved = AocRulebook.ResolveRoundRules(tournament.RoundsList, tournament.RoundRulesMap);

        var missing = tournament.RoundsList
            .Where(r => !resolved.ContainsKey(r.Id))
            .Select(r => r.Id)
            .ToList();
        if (missing.Count > 0)
            throw new MatchError(MatchErrorCode.NOT_READY,
                $"these rounds are not ones this app can play: {string.Join(", ", missing)}",
                missing);

        return resolved;
    }
}
