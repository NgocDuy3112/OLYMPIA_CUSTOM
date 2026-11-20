using AOC.Domain.Contracts;

namespace AOC.Domain.Tournament;

public static class GroupStage
{
    public enum GroupPhase
    {
        Phase1 = 1,
        Phase2 = 2
    }

    public static GroupPhase? PhaseOfStage(string stageId) => stageId switch
    {
        "phase-1" => GroupPhase.Phase1,
        "phase-2" => GroupPhase.Phase2,
        _ => null
    };

    public static readonly int[] GroupSeatCounts = [3, 4];

    private static readonly Dictionary<GroupPhase, Dictionary<int, int[]>> GroupPoints = new()
    {
        [GroupPhase.Phase1] = new() { [3] = [2], [4] = [3, 1] },
        [GroupPhase.Phase2] = new() { [3] = [1], [4] = [2] }
    };

    public static int GroupPointsFor(GroupPhase phase, int seatCount, int rank)
    {
        if (rank < 1) return 0;
        if (!GroupPoints[phase].TryGetValue(seatCount, out var table)) return 0;
        return rank - 1 < table.Length ? table[rank - 1] : 0;
    }

    public static int CountedScore(GroupPhase phase, int raw)
        => phase == GroupPhase.Phase1 && raw < 0 ? 0 : raw;

    public sealed record PlayedMatch(GroupPhase Phase, int RawScore);

    public sealed record Averages(double? Phase1, double? Phase2, double? All);

    public static Averages ComputeAverages(IReadOnlyList<PlayedMatch> matchesPlayed)
    {
        double? Mean(IEnumerable<PlayedMatch> ms)
        {
            var list = ms.ToList();
            if (list.Count == 0) return null;
            var total = list.Sum(m => CountedScore(m.Phase, m.RawScore));
            return (double)total / list.Count;
        }

        return new Averages(
            Mean(matchesPlayed.Where(m => m.Phase == GroupPhase.Phase1)),
            Mean(matchesPlayed.Where(m => m.Phase == GroupPhase.Phase2)),
            Mean(matchesPlayed));
    }

    public sealed record GroupMatchResult(string UserId, int Rank, int RawScore);
    public sealed record GroupMatchInput(GroupPhase Phase, List<GroupMatchResult> Results);

    public sealed record GroupContestantLine(
        string UserId,
        PlayerGroup Group,
        int MatchesPlayed,
        int BankedPoints,
        Averages Averages
    );

    public sealed record GroupBlock(int GroupPoints, List<GroupContestantLine> Contestants);

    public sealed record WildcardLine(GroupContestantLine Line, double Avg);

    public sealed record GroupStandings(
        Dictionary<PlayerGroup, GroupBlock> ByGroup,
        List<WildcardLine> Wildcard
    );

    public static GroupStandings Build(
        IReadOnlyDictionary<string, PlayerGroup> roster,
        IReadOnlyList<GroupMatchInput> matches)
    {
        var perUser = new Dictionary<string, (List<PlayedMatch> Matches, int Banked)>();

        foreach (var match in matches)
        {
            var seatCount = match.Results.Count;
            foreach (var r in match.Results)
            {
                if (!roster.ContainsKey(r.UserId)) continue;
                if (!perUser.TryGetValue(r.UserId, out var entry))
                {
                    entry = ([], 0);
                    perUser[r.UserId] = entry;
                }
                entry.Matches.Add(new PlayedMatch(match.Phase, r.RawScore));
                entry.Banked += GroupPointsFor(match.Phase, seatCount, r.Rank);
                perUser[r.UserId] = entry;
            }
        }

        var lines = new List<GroupContestantLine>();
        foreach (var (userId, group) in roster)
        {
            perUser.TryGetValue(userId, out var entry);
            lines.Add(new GroupContestantLine(
                userId,
                group,
                entry.Matches?.Count ?? 0,
                entry.Banked,
                ComputeAverages(entry.Matches ?? [])));
        }

        var byGroup = new Dictionary<PlayerGroup, GroupBlock>
        {
            [PlayerGroup.A] = new GroupBlock(0, []),
            [PlayerGroup.B] = new GroupBlock(0, [])
        };
        foreach (var line in lines)
        {
            var block = byGroup[line.Group];
            block.Contestants.Add(line);
            byGroup[line.Group] = block with { GroupPoints = block.GroupPoints + line.BankedPoints };
        }

        foreach (var g in new[] { PlayerGroup.A, PlayerGroup.B })
        {
            var block = byGroup[g];
            var sorted = block.Contestants
                .OrderByDescending(c => c.MatchesPlayed == 0 ? 0 : 1)
                .ThenByDescending(c => c.BankedPoints)
                .ThenByDescending(c => c.Averages.All ?? double.NegativeInfinity)
                .ToList();
            byGroup[g] = block with { Contestants = sorted };
        }

        var wildcard = lines
            .Where(l => l.MatchesPlayed > 0)
            .Select(l => new WildcardLine(l, l.Averages.All ?? double.NaN))
            .OrderByDescending(w => w.Avg)
            .ThenByDescending(w => w.Line.BankedPoints)
            .ToList();

        return new GroupStandings(byGroup, wildcard);
    }
}
