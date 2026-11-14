namespace AOC.Domain.Engine;

/// <summary>Port of engine/bracket.ts — tier drawing and ladder progression.</summary>
public static class Bracket
{
    public static List<List<string>> TiersOf(IReadOnlyList<string> ranked, int tierSize)
    {
        var tiers = new List<List<string>>();
        for (var i = 0; i < ranked.Count; i += tierSize)
            tiers.Add(ranked.Skip(i).Take(tierSize).ToList());
        return tiers;
    }

    public static Dictionary<string, int> TierOf(IReadOnlyList<string> ranked, int tierSize)
    {
        var map = new Dictionary<string, int>();
        for (var index = 0; index < ranked.Count; index++)
            map[ranked[index]] = index / tierSize;
        return map;
    }

    public static List<List<string>> TierDraw(IReadOnlyList<string> ranked, int tierSize, int matchCount)
    {
        var tiers = TiersOf(ranked, tierSize);
        var matches = new List<List<string>>();
        for (var match = 0; match < matchCount; match++)
        {
            var seats = new List<string>();
            foreach (var tier in tiers)
                if (match < tier.Count)
                    seats.Add(tier[match]);
            matches.Add(seats);
        }
        return matches;
    }

    public static List<string> TierViolations(IReadOnlyList<List<string>> matches, IReadOnlyList<string> ranked, int tierSize)
    {
        var tiers = TierOf(ranked, tierSize);
        var tierCount = (int)Math.Ceiling(ranked.Count / (double)tierSize);
        var problems = new List<string>();

        for (var index = 0; index < matches.Count; index++)
        {
            var seen = new Dictionary<int, List<string>>();
            foreach (var userId in matches[index])
            {
                if (!tiers.TryGetValue(userId, out var tier))
                {
                    problems.Add($"match {index + 1}: {userId} is not in the ranking");
                    continue;
                }
                if (!seen.TryGetValue(tier, out var players))
                {
                    players = [];
                    seen[tier] = players;
                }
                players.Add(userId);
            }
            foreach (var (tier, players) in seen)
                if (players.Count > 1)
                    problems.Add($"match {index + 1}: {players.Count} players from tier {tier} ({string.Join(", ", players)})");
            if (seen.Count < tierCount)
            {
                var missing = new List<int>();
                for (var tier = 0; tier < tierCount; tier++)
                    if (!seen.ContainsKey(tier))
                        missing.Add(tier);
                problems.Add($"match {index + 1}: no player from tier {string.Join(", ", missing)}");
            }
        }

        return problems;
    }

    public sealed record LadderMatch(int Slot, List<string> Order);
    public sealed record LadderRound(List<LadderMatch> Matches);
    public sealed record LadderStep(List<string> ToFinale, List<string> Eliminated, LadderRound Next);

    public static LadderRound InitialLadder(IReadOnlyList<string> ranked, int tierSize)
    {
        var matches = new List<LadderMatch>();
        for (var i = 0; i < ranked.Count; i += tierSize)
            matches.Add(new LadderMatch(i / tierSize + 1, ranked.Skip(i).Take(tierSize).ToList()));
        return new LadderRound(matches);
    }

    public static LadderStep LadderNext(LadderRound round, List<string>? toFinale = null)
    {
        if (round.Matches.Count == 0)
            throw new RuleError("VALIDATION", "the ladder round has no matches");

        var sorted = round.Matches.OrderBy(m => m.Slot).ToList();
        var last = sorted[^1];
        var eliminated = last.Order.Skip(1).ToList();

        var matches = new List<LadderMatch>();
        for (var i = 0; i < sorted.Count - 1; i++)
        {
            var upper = sorted[i];
            var lower = sorted[i + 1];
            matches.Add(new LadderMatch(i + 1, [lower.Order[0], .. upper.Order.Skip(1)]));
        }

        var head = toFinale ?? [];
        head.Add(sorted[0].Order[0]);
        return new LadderStep(head, eliminated, new LadderRound(matches));
    }

    public static List<string> LadderViolations(LadderRound expected, IReadOnlyList<LadderMatch> actual)
    {
        var problems = new List<string>();
        var bySlot = actual.ToDictionary(m => m.Slot, m => m.Order);

        foreach (var match in expected.Matches)
        {
            if (!bySlot.TryGetValue(match.Slot, out var seats))
            {
                problems.Add($"slot {match.Slot}: no match");
                continue;
            }
            var wanted = match.Order;
            if (seats.Count != wanted.Count)
            {
                problems.Add($"slot {match.Slot}: {seats.Count} players, the format wants {wanted.Count}");
                continue;
            }
            var missing = wanted.Where(userId => !seats.Contains(userId)).ToList();
            if (missing.Count > 0)
                problems.Add($"slot {match.Slot}: {string.Join(", ", missing)} should be in this match");
        }

        return problems;
    }
}
