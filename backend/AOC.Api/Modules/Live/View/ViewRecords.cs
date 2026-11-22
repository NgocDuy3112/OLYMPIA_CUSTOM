using AOC.Domain.Contracts;

namespace AOC.Api.Modules.Live;

public sealed record ScoreRow(string Id, string DisplayName, int Points);

public sealed record RankedScore(string Id, string DisplayName, int Points, int Rank);

public sealed record SubmittedAnswerRow(
    string QuestionId, Verdict? Verdict, int? AnsweredMs = null,
    Verdict? Suggestion = null, AnswerValue? Value = null);

public sealed record JudgedRow(string QuestionId, string UserId, Verdict? Verdict, int? AnsweredMs = null);

public sealed record RevealedAnswerRow(string UserId, AnswerValue Value, Verdict? Verdict, int? AnsweredMs = null);
