using AOC.Domain.Contracts;

namespace AOC.Api.Modules.Matches;

public static class MatchScoring
{
    public sealed record AnswerForScoring(string UserId, string RoundId, int PointsAwarded);

    public sealed record MatchResultInput(
        IReadOnlyList<string> Competitors,
        IReadOnlyList<AnswerForScoring> Answers,
        IReadOnlyDictionary<string, int>? Adjustments = null,
        IReadOnlyDictionary<string, int>? TieBreak = null,
        IReadOnlyDictionary<string, int>? BuzzMs = null);

    public static Dictionary<string, int> DenseRanks(
        IEnumerable<(string Key, int Total)> entries,
        IReadOnlyDictionary<string, int>? tieBreak = null,
        IReadOnlyDictionary<string, int>? buzzMs = null)
    {
        int TieOf((string Key, int Total) entry)
            => tieBreak is not null && tieBreak.TryGetValue(entry.Key, out var points) ? points : 0;
        int BuzzOf((string Key, int Total) entry)
            => buzzMs is not null && buzzMs.TryGetValue(entry.Key, out var ms) ? ms : int.MaxValue;

        var sorted = entries
            .OrderByDescending(e => e.Total)
            .ThenByDescending(TieOf)
            .ThenBy(BuzzOf)
            .ToList();
        var ranks = new Dictionary<string, int>();
        var rank = 0;
        (int Total, int Tie, int Buzz)? last = null;
        foreach (var entry in sorted)
        {
            var key = (entry.Total, TieOf(entry), BuzzOf(entry));
            if (last is null || key != last.Value)
            {
                rank += 1;
                last = key;
            }
            ranks[entry.Key] = rank;
        }
        return ranks;
    }

    public static List<ResultEntry> BuildMatchResults(MatchResultInput input)
    {
        var byUser = new Dictionary<string, (int Total, Dictionary<string, int> RoundScores)>();
        foreach (var userId in input.Competitors)
            byUser[userId] = (0, new Dictionary<string, int>());

        foreach (var answer in input.Answers)
        {
            if (!byUser.TryGetValue(answer.UserId, out var bucket)) continue;
            bucket.Total += answer.PointsAwarded;
            bucket.RoundScores[answer.RoundId] =
                bucket.RoundScores.GetValueOrDefault(answer.RoundId) + answer.PointsAwarded;
            byUser[answer.UserId] = bucket;
        }

        if (input.Adjustments is not null)
            foreach (var (userId, delta) in input.Adjustments)
            {
                if (!byUser.TryGetValue(userId, out var bucket)) continue;
                bucket.Total += delta;
                byUser[userId] = bucket;
            }

        var ranks = DenseRanks(byUser.Select(kv => (kv.Key, kv.Value.Total)), input.TieBreak, input.BuzzMs);

        return byUser
            .Select(kv => new ResultEntry
            {
                Kind = "user",
                UserId = kv.Key,
                TotalScore = kv.Value.Total,
                Rank = ranks.GetValueOrDefault(kv.Key),
                RoundScores = kv.Value.RoundScores
            })
            .OrderBy(r => r.Rank)
            .ThenBy(r => r.UserId, StringComparer.Ordinal)
            .ToList();
    }
}
