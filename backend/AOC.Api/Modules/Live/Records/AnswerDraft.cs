using AOC.Domain.Contracts;

namespace AOC.Api.Modules.Live;

public sealed record AnswerDraft(
    string UserId,
    int? AnsweredMs,
    Verdict? Verdict = null);
