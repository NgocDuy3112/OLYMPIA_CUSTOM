using System.Text.Json;
using AOC.Domain.Contracts;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Matches;

public sealed record MatchSummary(
    Guid Id,
    string StageId,
    int? Slot,
    string Label,
    MatchStatus Status,
    DateTime ScheduledAt,
    JsonElement Players,
    JsonElement Questions,
    int AssemblyRevision,
    DateTime? AssembledAt)
{
    [System.Text.Json.Serialization.JsonIgnore]
    public List<Seat> PlayersList => JsonDefaults.Deserialize<List<Seat>>(Players) ?? [];

    public static MatchSummary Of(MatchEntity row) => new(
        row.Id, row.StageId, row.Slot, row.Label, row.Status, row.ScheduledAt,
        row.Players, row.Questions, row.AssemblyRevision, row.AssembledAt);
}

public sealed record MatchAssemblyEvent(
    Guid Id,
    Guid MatchId,
    int Revision,
    Guid ActorId,
    string Mode,
    int AddedCount,
    int RemovedCount,
    string[] SourceIds,
    DateTime At)
{
    public static MatchAssemblyEvent Of(MatchAssemblyEventEntity row) => new(
        row.Id, row.MatchId, row.Revision, row.ActorId, row.Mode,
        row.AddedCount, row.RemovedCount, row.SourceIds, row.At);
}

public sealed record MatchDetail(
    Guid Id,
    Guid TournamentId,
    string StageId,
    DateTime ScheduledAt,
    string Label,
    MatchStatus Status,
    MatchKind Kind,
    int? Slot,
    JsonElement Players,
    JsonElement RoundConfigs,
    JsonElement Questions,
    int AssemblyRevision,
    DateTime? AssembledAt,
    Guid? ControllerId,
    DateTime? ControllerHeartbeatAt,
    JsonElement? Live,
    JsonElement? Discord,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    DateTime? DeletedAt,
    List<MatchAssemblyEvent> AssemblyEvents)
{
    public static MatchDetail Of(MatchEntity row, List<MatchAssemblyEvent> assemblyEvents) => new(
        row.Id, row.TournamentId, row.StageId, row.ScheduledAt, row.Label, row.Status, row.Kind, row.Slot,
        row.Players, row.RoundConfigs, row.Questions, row.AssemblyRevision, row.AssembledAt,
        row.ControllerId, row.ControllerHeartbeatAt, row.Live, row.Discord,
        row.CreatedAt, row.UpdatedAt, row.DeletedAt, assemblyEvents);
}
