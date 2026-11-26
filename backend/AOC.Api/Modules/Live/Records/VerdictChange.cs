using AOC.Domain.Contracts;

namespace AOC.Api.Modules.Live;

public sealed record VerdictChange(
    string RoundId,
    string QuestionId,
    string PlayerId,
    Verdict Previous,
    Verdict Verdict);
