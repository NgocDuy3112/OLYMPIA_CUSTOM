using AOC.Domain.Tournament;

namespace AOC.Api.Modules.Standings;

public sealed record WildcardRow(
    string UserId, string DisplayName, int MatchesPlayed, int BankedPoints,
    GroupStage.Averages Averages, double Avg);
