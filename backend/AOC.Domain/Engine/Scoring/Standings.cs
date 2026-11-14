namespace AOC.Domain.Engine.Scoring;

/// <summary>Port of engine/scoring/standings.ts — tournament standings builder.</summary>
public static class Standings
{
    public sealed record StageRef(string Id, string Title);

    public sealed record MatchResultInput(
        string MatchId,
        string StageId,
        int? Slot,
        List<ResultRow> Results
    );

    public sealed record ResultRow(string UserId, int TotalScore, int Rank);

    public sealed record PlayerInput(string UserId, string DisplayName);

    public sealed record BuildStandingsInput(
        List<StageRef> Stages,
        List<MatchResultInput> Matches,
        List<PlayerInput> Players
    );

    public sealed record PlayerStanding(
        string UserId,
        string DisplayName,
        int? Place,
        int MatchesPlayed,
        string? StageId,
        string? StageTitle,
        int? Slot
    );

    private sealed record Progress(int StageIndex, int Slot, int Rank, string StageId, string StageTitle, string MatchId);

    private static bool IsFurther(Progress a, Progress? b)
    {
        if (b is null) return true;
        if (a.StageIndex != b.StageIndex) return a.StageIndex > b.StageIndex;
        if (a.Slot != b.Slot) return a.Slot < b.Slot;
        return a.Rank < b.Rank;
    }

    public static List<PlayerStanding> Build(BuildStandingsInput input)
    {
        var stageIndex = input.Stages
            .Select((stage, index) => (stage.Id, Index: index))
            .ToDictionary(x => x.Id, x => x.Index);
        var stageTitle = input.Stages.ToDictionary(stage => stage.Id, stage => stage.Title);

        var progress = new Dictionary<string, Progress>();
        var played = new Dictionary<string, int>();

        foreach (var match in input.Matches)
        {
            if (!stageIndex.TryGetValue(match.StageId, out var index)) continue;

            foreach (var entry in match.Results)
            {
                played[entry.UserId] = played.GetValueOrDefault(entry.UserId) + 1;

                var candidate = new Progress(
                    index,
                    match.Slot ?? int.MaxValue,
                    entry.Rank,
                    match.StageId,
                    stageTitle.GetValueOrDefault(match.StageId, match.StageId),
                    match.MatchId);

                if (IsFurther(candidate, progress.GetValueOrDefault(entry.UserId)))
                    progress[entry.UserId] = candidate;
            }
        }

        var placed = progress
            .Select(kv => (UserId: kv.Key, Value: kv.Value))
            .OrderByDescending(x => x.Value.StageIndex)
            .ThenBy(x => x.Value.Slot)
            .ThenBy(x => x.Value.Rank)
            .ThenBy(x => x.UserId, StringComparer.Ordinal)
            .ToList();

        var rows = new List<PlayerStanding>();
        var place = 0;
        Progress? previous = null;

        foreach (var entry in placed)
        {
            var value = entry.Value;
            var sameMatch = previous is not null
                && previous.MatchId == value.MatchId
                && previous.Rank == value.Rank;
            if (!sameMatch) place += 1;

            var displayName = input.Players.FirstOrDefault(p => p.UserId == entry.UserId)?.DisplayName
                ?? entry.UserId;

            rows.Add(new PlayerStanding(
                entry.UserId,
                displayName,
                place,
                played.GetValueOrDefault(entry.UserId),
                value.StageId,
                value.StageTitle,
                value.Slot == int.MaxValue ? null : value.Slot));

            previous = value;
        }

        var seated = progress.Keys.ToHashSet();
        var idle = input.Players
            .Where(row => !seated.Contains(row.UserId))
            .Select(row => new PlayerStanding(
                row.UserId, row.DisplayName, null, 0, null, null, null))
            .ToList();

        rows.AddRange(idle);
        return rows;
    }
}
