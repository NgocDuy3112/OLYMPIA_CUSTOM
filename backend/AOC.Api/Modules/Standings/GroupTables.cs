namespace AOC.Api.Modules.Standings;

public sealed record GroupTables(
    List<GroupBlock> Groups, List<UnassignedRow> Unassigned, List<WildcardRow> Wildcard);
