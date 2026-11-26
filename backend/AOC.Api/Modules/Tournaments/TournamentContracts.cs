using System.Text.Json;
using AOC.Domain.Gameplay;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Tournaments;

public sealed record TournamentDetail(
    Guid Id,
    string Name,
    string Slug,
    Visibility Visibility,
    Guid OwnerId,
    bool Current,
    JsonElement Rounds,
    JsonElement Format,
    JsonElement Stages,
    JsonElement RoundRules,
    DateTime? ClosedAt,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    DateTime? DeletedAt,
    int Places)
{
    public static TournamentDetail Of(TournamentEntity row, int places) => new(
        row.Id, row.Name, row.Slug, row.Visibility, row.OwnerId, row.Current,
        row.Rounds, row.Format, row.Stages,
        JsonDefaults.Serialize(AocRulebook.ResolveRoundRules(row.RoundsList, row.RoundRulesMap)),
        row.ClosedAt, row.CreatedAt, row.UpdatedAt, row.DeletedAt, places);
}
