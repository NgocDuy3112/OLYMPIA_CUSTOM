using AOC.Api.Shared;
using AOC.Domain.Gameplay.Turns;

namespace AOC.Api.Modules.Live.TieBreak;

public sealed record TieBreakView(
    string MatchId,
    int Version,
    string Stage,
    string? QuestionId,
    int Cursor,
    bool Ended,
    AnswerWindow Window,
    bool WindowOpen,
    string? DeadlineAt,
    List<TieBreakPlayerView> Players,
    TieBreakPlayerView? Me,
    SanitizedQuestion? Question);
