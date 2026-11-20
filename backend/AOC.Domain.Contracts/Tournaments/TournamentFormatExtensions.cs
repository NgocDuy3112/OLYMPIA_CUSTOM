namespace AOC.Domain.Contracts;

public static class TournamentFormatExtensions
{
    public static List<int> AllowedSeatCounts(this TournamentFormat format)
        => format.AllowedCompetitorCounts ?? [format.CompetitorsPerMatch];
}
