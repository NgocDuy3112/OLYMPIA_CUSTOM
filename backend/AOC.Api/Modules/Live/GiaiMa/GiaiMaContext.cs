using AOC.Domain.Gameplay;

namespace AOC.Api.Modules.Live;

public sealed record GiaiMaContext(
    string ActorId, string RoundId, string Now, RoundRules.GiaiMaRules Rules,
    string HintTurnId, List<AnswerDraft> AnswerDrafts);
