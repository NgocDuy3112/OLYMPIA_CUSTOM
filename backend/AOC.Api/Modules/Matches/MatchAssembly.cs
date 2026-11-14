using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Api.Modules.Questions;
using AOC.Domain.Contracts;
using AOC.Domain.Engine;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Matches;

/// <summary>Port of matches/assembly.ts — copies bank questions into a match.</summary>
public sealed class MatchAssembly(AOCDbContext db)
{
    public static int BasePoints(ScoringRule scoring) => scoring switch
    {
        ScoringRule.Constant c => c.Points,
        ScoringRule.KeywordDerived k => k.Initial,
        ScoringRule.RankMultiplier r => r.LadderTop,
        ScoringRule.OutcomeMultipliers => 1,
        _ => 0
    };

    private sealed record TurnContext(RoundConfig Config, QuestionMode Mode);

    private static TurnContext RequireTurn(
        TournamentEntity tournament,
        Dictionary<string, RoundConfig> roundConfigs,
        string roundId,
        string turnId,
        string where)
    {
        if (!tournament.RoundsList.Any(r => r.Id == roundId))
            throw new MatchError(MatchErrorCode.VALIDATION,
                $"{where}: round \"{roundId}\" is not one of this tournament's rounds");

        // A match created before its rulebook was saved falls back to the AOC rulebook.
        var config = roundConfigs.GetValueOrDefault(roundId) ?? AocRulebook.AocRoundConfig(roundId)
            ?? throw new MatchError(MatchErrorCode.VALIDATION,
                $"{where}: no roundConfig provided for round \"{roundId}\"");

        var turn = config.Turns.FirstOrDefault(t => t.Id == turnId)
            ?? throw new MatchError(MatchErrorCode.VALIDATION,
                $"{where}: turn \"{turnId}\" is not part of round \"{roundId}\"");

        return new TurnContext(config, turn.Mode);
    }

    public async Task<List<MatchQuestion>> BuildQuestionCopiesAsync(
        TournamentEntity tournament,
        Dictionary<string, RoundConfig> roundConfigs,
        IReadOnlyList<AssemblyEntry> entries)
    {
        var copies = new List<MatchQuestion>();
        var nextPosition = new Dictionary<string, int>();
        var usedSourceIds = new HashSet<string>();

        int PositionFor(string roundId, string turnId, int? requested)
        {
            if (requested is not null) return requested.Value;
            var key = $"{roundId}:{turnId}";
            var next = nextPosition.GetValueOrDefault(key);
            nextPosition[key] = next + 1;
            return next;
        }

        if (entries.Count > 0)
        {
            var sourceIds = entries.Select(e => Guid.Parse(e.SourceId)).ToList();
            var bankRows = await db.QuestionBank.AsNoTracking()
                .Where(q => sourceIds.Contains(q.Id))
                .ToListAsync();
            var bankById = bankRows.ToDictionary(q => q.Id);

            for (var index = 0; index < entries.Count; index++)
            {
                var entry = entries[index];
                var where = $"questions[{index}]";
                var (config, mode) = RequireTurn(tournament, roundConfigs, entry.RoundId, entry.TurnId, where);

                if (!bankById.TryGetValue(Guid.Parse(entry.SourceId), out var source))
                    throw new MatchError(MatchErrorCode.VALIDATION,
                        $"{where}: question {entry.SourceId} does not exist");
                if (source.Status != QuestionStatus.PUBLISHED)
                    throw new MatchError(MatchErrorCode.VALIDATION,
                        $"{where}: question {entry.SourceId} is {source.Status}, not PUBLISHED");
                if (!config.AllowedKinds.Contains(source.Kind))
                    throw new MatchError(MatchErrorCode.VALIDATION,
                        $"{where}: kind {source.Kind} is not allowed in round \"{entry.RoundId}\"",
                        [$"allowed kinds: {string.Join(", ", config.AllowedKinds)}"]);

                var type = source.Type;
                var conflict = Buckets.SlotConflict(
                    new Buckets.Slot(entry.RoundId, entry.TurnId, entry.Points),
                    new Buckets.SlotConflictSource(
                        source.Tags, string.IsNullOrEmpty(type) ? null : type,
                        source.KeywordId?.ToString()));
                if (conflict is not null)
                    throw new MatchError(MatchErrorCode.VALIDATION, $"{where}: {conflict}");

                usedSourceIds.Add(entry.SourceId);

                copies.Add(new MatchQuestion
                {
                    Id = Guid.NewGuid().ToString(),
                    RoundId = entry.RoundId,
                    TurnId = entry.TurnId,
                    Position = PositionFor(entry.RoundId, entry.TurnId, entry.Position),
                    Mode = mode,
                    Kind = source.Kind,
                    QuestionText = source.QuestionText,
                    Media = source.MediaValue,
                    TimeLimit = source.TimeLimit,
                    Points = entry.Points ?? BasePoints(config.Scoring),
                    Payload = source.PayloadValue,
                    SourceId = source.Id.ToString()
                });
            }
        }

        return copies;
    }
}
