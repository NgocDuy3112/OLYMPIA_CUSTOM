using System.Text.Json;
using Microsoft.Extensions.Logging;
using AOC.Domain.Contracts;

namespace AOC.Infrastructure.Data.Entities;

// Auth -------------------------------------------------------------------

public class UserEntity
{
    public Guid Id { get; set; }
    public UserRole Role { get; set; }
    public string Username { get; set; } = "";
    public string? Email { get; set; }
    public bool EmailVerified { get; set; }
    public string DisplayName { get; set; } = "";
    public string? AvatarUrl { get; set; }
    public string? DiscordId { get; set; }
    public string? PasswordHash { get; set; }
    public bool MustChangePassword { get; set; }
    public string? TotpSecret { get; set; }
    public DateTime? TotpEnabledAt { get; set; }
    public int? TotpLastUsedStep { get; set; }
    public int TokenVersion { get; set; }
    public DateTime? DisabledAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class OauthAccountEntity
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Provider { get; set; } = "";
    public string Sub { get; set; } = "";
    public DateTime CreatedAt { get; set; }
}

public class McpKeyEntity
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Label { get; set; } = "";
    public string Prefix { get; set; } = "";
    public string KeyHash { get; set; } = "";
    public string[] Scopes { get; set; } = ["READ"];
    public DateTime? ExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime LastUsedAt { get; set; }
    public string? LastIp { get; set; }
    public string? LastUserAgent { get; set; }
    public DateTime? RevokedAt { get; set; }
}

// Reference ---------------------------------------------------------------

public class TournamentEntity
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string Slug { get; set; } = "";
    public Visibility Visibility { get; set; } = Visibility.PUBLIC;
    public Guid OwnerId { get; set; }
    public bool Current { get; set; }

    /// <summary>TournamentRound[] (jsonb).</summary>
    public JsonElement Rounds { get; set; }

    /// <summary>TournamentFormat (jsonb).</summary>
    public JsonElement Format { get; set; }

    /// <summary>Stage[] (jsonb).</summary>
    public JsonElement Stages { get; set; }

    /// <summary>Record&lt;roundId, RoundConfig&gt; (jsonb, nullable).</summary>
    public JsonElement? RoundRules { get; set; }

    public DateTime? ClosedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime? DeletedAt { get; set; }

    // Typed conveniences (jsonb round-trips through the shared options).
    [System.ComponentModel.DataAnnotations.Schema.NotMapped]
    [System.Text.Json.Serialization.JsonIgnore]
    public List<TournamentRound> RoundsList
    {
        get => JsonDefaults.Deserialize<List<TournamentRound>>(Rounds) ?? [];
        set => Rounds = JsonDefaults.Serialize(value);
    }

    [System.ComponentModel.DataAnnotations.Schema.NotMapped]
    [System.Text.Json.Serialization.JsonIgnore]
    public TournamentFormat FormatValue
    {
        get => JsonDefaults.Deserialize<TournamentFormat>(Format)!;
        set => Format = JsonDefaults.Serialize(value);
    }

    [System.ComponentModel.DataAnnotations.Schema.NotMapped]
    [System.Text.Json.Serialization.JsonIgnore]
    public List<Stage> StagesList
    {
        get => JsonDefaults.Deserialize<List<Stage>>(Stages) ?? [];
        set => Stages = JsonDefaults.Serialize(value);
    }

    [System.ComponentModel.DataAnnotations.Schema.NotMapped]
    [System.Text.Json.Serialization.JsonIgnore]
    public Dictionary<string, RoundConfig>? RoundRulesMap
    {
        get => RoundRules is { } el ? JsonDefaults.Deserialize<Dictionary<string, RoundConfig>>(el) : null;
        set => RoundRules = value is null ? null : JsonDefaults.Serialize(value);
    }
}

public class TournamentPlayerEntity
{
    public Guid TournamentId { get; set; }
    public Guid UserId { get; set; }
    public PlayerGroup? Group { get; set; }
    public DateTime EnrolledAt { get; set; }
}

public class QuestionImportBatchEntity
{
    public Guid Id { get; set; }
    public Guid? CreatedBy { get; set; }
    public string? SourceName { get; set; }
    public int RowCount { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class SourceCells
{
    public string Question { get; set; } = "";
    public string Answer { get; set; } = "";
    public string Explanation { get; set; } = "";
    public string Note { get; set; } = "";
    public string Media { get; set; } = "";
}

public class QuestionImportRowEntity
{
    public Guid Id { get; set; }
    public Guid BatchId { get; set; }
    public int Position { get; set; }
    public string Sheet { get; set; } = "";
    public string SourceId { get; set; } = "";
    public JsonElement Cells { get; set; }
    public JsonElement? Media { get; set; }
    public string? Error { get; set; }
    public string? Warning { get; set; }
    public bool Dropped { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    [System.ComponentModel.DataAnnotations.Schema.NotMapped]
    [System.Text.Json.Serialization.JsonIgnore]
    public SourceCells CellsObject
    {
        get => JsonDefaults.Deserialize<SourceCells>(Cells) ?? new SourceCells();
        set => Cells = JsonDefaults.Serialize(value);
    }

    [System.ComponentModel.DataAnnotations.Schema.NotMapped]
    [System.Text.Json.Serialization.JsonIgnore]
    public AOC.Domain.Contracts.Media? MediaObject
    {
        get => Media is { } el ? JsonDefaults.Deserialize<AOC.Domain.Contracts.Media>(el) : null;
        set => Media = value is null ? null : JsonDefaults.Serialize(value);
    }
}

public class QuestionBankEntity
{
    public Guid Id { get; set; }
    public QuestionKind Kind { get; set; }
    public string QuestionText { get; set; } = "";
    public Guid? KeywordId { get; set; }
    public JsonElement? Media { get; set; }

    /// <summary>QuestionPayload (jsonb, polymorphic).</summary>
    public JsonElement Payload { get; set; }

    public int? TimeLimit { get; set; }
    public QuestionStatus Status { get; set; } = QuestionStatus.DRAFT;
    public string[] Tags { get; set; } = [];

    /// <summary>Generated column: (payload ->&gt; 'type').</summary>
    public string Type { get; set; } = "";

    public Guid CreatedBy { get; set; }
    public Guid? ImportBatchId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    [System.ComponentModel.DataAnnotations.Schema.NotMapped]
    [System.Text.Json.Serialization.JsonIgnore]
    public QuestionPayload PayloadValue
    {
        get => JsonDefaults.Deserialize<QuestionPayload>(Payload)!;
        set => Payload = JsonDefaults.Serialize(value);
    }

    [System.ComponentModel.DataAnnotations.Schema.NotMapped]
    [System.Text.Json.Serialization.JsonIgnore]
    public AOC.Domain.Contracts.Media? MediaValue
    {
        get => Media is { } el ? JsonDefaults.Deserialize<AOC.Domain.Contracts.Media>(el) : null;
        set => Media = value is null ? null : JsonDefaults.Serialize(value);
    }
}

// Game --------------------------------------------------------------------

public class MatchEntity
{
    public Guid Id { get; set; }
    public Guid TournamentId { get; set; }
    public string StageId { get; set; } = "";
    public DateTime ScheduledAt { get; set; }
    public string Label { get; set; } = "";
    public MatchStatus Status { get; set; } = MatchStatus.UPCOMING;
    public MatchKind Kind { get; set; } = MatchKind.STANDARD;
    public int? Slot { get; set; }

    /// <summary>Seat[] (jsonb).</summary>
    public JsonElement Players { get; set; }

    /// <summary>Record&lt;roundId, RoundConfig&gt; (jsonb).</summary>
    public JsonElement RoundConfigs { get; set; }

    /// <summary>MatchQuestion[] (jsonb).</summary>
    public JsonElement Questions { get; set; }

    public int AssemblyRevision { get; set; }
    public DateTime? AssembledAt { get; set; }
    public JsonElement? Live { get; set; }
    public JsonElement? Discord { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime? DeletedAt { get; set; }

    [System.ComponentModel.DataAnnotations.Schema.NotMapped]
    [System.Text.Json.Serialization.JsonIgnore]
    public List<Seat> PlayersList
    {
        get => JsonDefaults.Deserialize<List<Seat>>(Players) ?? [];
        set => Players = JsonDefaults.Serialize(value);
    }

    [System.ComponentModel.DataAnnotations.Schema.NotMapped]
    [System.Text.Json.Serialization.JsonIgnore]
    public Dictionary<string, RoundConfig> RoundConfigsMap
    {
        get => JsonDefaults.Deserialize<Dictionary<string, RoundConfig>>(RoundConfigs) ?? [];
        set => RoundConfigs = JsonDefaults.Serialize(value);
    }

    [System.ComponentModel.DataAnnotations.Schema.NotMapped]
    [System.Text.Json.Serialization.JsonIgnore]
    public List<MatchQuestion> QuestionsList
    {
        get => JsonDefaults.Deserialize<List<MatchQuestion>>(Questions) ?? [];
        set => Questions = JsonDefaults.Serialize(value);
    }

    [System.ComponentModel.DataAnnotations.Schema.NotMapped]
    [System.Text.Json.Serialization.JsonIgnore]
    public MatchLive? LiveValue
    {
        get => Live is { } el ? JsonDefaults.Deserialize<MatchLive>(el) : null;
        set => Live = value is null ? null : JsonDefaults.Serialize(value);
    }
}

public class MatchCodeEntity
{
    public Guid Id { get; set; }
    public string Code { get; set; } = "";
    public Guid MatchId { get; set; }
    public DateTime ExpiresAt { get; set; }
    public Guid? CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class AnswerEntity
{
    public Guid Id { get; set; }
    public Guid MatchId { get; set; }
    public Guid QuestionId { get; set; }
    public Guid UserId { get; set; }

    /// <summary>AnswerValue (jsonb).</summary>
    public JsonElement Value { get; set; }

    /// <summary>Drafts (jsonb): { [draftedBy]: verdict }.</summary>
    public JsonElement? Drafts { get; set; }

    public int? FirstAnsweredMs { get; set; }
    public int? AnsweredMs { get; set; }
    public bool AutoMatched { get; set; }
    public bool Judged { get; set; }
    public Verdict? Verdict { get; set; }
    public int? PointsAwarded { get; set; }
    public DateTime SubmittedAt { get; set; }

    [System.ComponentModel.DataAnnotations.Schema.NotMapped]
    [System.Text.Json.Serialization.JsonIgnore]
    public AnswerValue ValueObject
    {
        get => JsonDefaults.Deserialize<AnswerValue>(Value)!;
        set => Value = JsonDefaults.Serialize(value);
    }
}

public class MatchResultEntity
{
    public Guid MatchId { get; set; }
    public Guid TournamentId { get; set; }

    /// <summary>ResultEntry[] (jsonb).</summary>
    public JsonElement Results { get; set; }

    public DateTime ComputedAt { get; set; }
}

public class ScoreAdjustmentEntity
{
    public Guid Id { get; set; }
    public Guid MatchId { get; set; }
    public Guid UserId { get; set; }
    public int Delta { get; set; }
    public string Reason { get; set; } = "";
    public Guid? CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class TournamentStandingEntity
{
    public Guid TournamentId { get; set; }
    public Guid UserId { get; set; }
    public int Rank { get; set; }
    public DateTime ComputedAt { get; set; }
}

public class MatchStatEntity
{
    public Guid MatchId { get; set; }
    public Guid TournamentId { get; set; }
    public string RoundId { get; set; } = "";
    public Guid QuestionId { get; set; }
    public Guid UserId { get; set; }
    public int? BasePoints { get; set; }
    public bool? Answered { get; set; }
    public bool? Correct { get; set; }
    public Verdict? Verdict { get; set; }
    public int? PointsAwarded { get; set; }
    public int? FirstAnsweredMs { get; set; }
    public int? AnsweredMs { get; set; }
    public int? PickOrder { get; set; }
    public int? BuzzMs { get; set; }
    public bool? BuzzWon { get; set; }
    public Power? Power { get; set; }
}

public class MatchEventEntity
{
    public Guid Id { get; set; }
    public Guid MatchId { get; set; }
    public Guid QuestionId { get; set; }
    public Guid UserId { get; set; }
    public string? RoundId { get; set; }
    public MatchEventKind Kind { get; set; }

    /// <summary>MatchEventPayload (jsonb).</summary>
    public JsonElement Payload { get; set; }

    public DateTime At { get; set; }
}

public class MatchLiveEntity
{
    public Guid MatchId { get; set; }
    public int Version { get; set; }
    public string RoundId { get; set; } = "";

    /// <summary>Round engine state (jsonb, validated on read).</summary>
    public JsonElement State { get; set; }

    /// <summary>roundId → archived state (jsonb).</summary>
    public JsonElement Archive { get; set; }

    public DateTime UpdatedAt { get; set; }
}

public class MatchAssemblyEventEntity
{
    public Guid Id { get; set; }
    public Guid MatchId { get; set; }
    public int Revision { get; set; }
    public Guid ActorId { get; set; }
    public string Mode { get; set; } = "replace";
    public int AddedCount { get; set; }
    public int RemovedCount { get; set; }
    public string[] SourceIds { get; set; } = [];
    public DateTime At { get; set; }
}

public class RecordingEntity
{
    public Guid Id { get; set; }
    public Guid MatchId { get; set; }
    public string? EgressId { get; set; }
    public RecordingStatus Status { get; set; }
    public string? S3Key { get; set; }
    public Guid? StartedBy { get; set; }
    public DateTime StartedAt { get; set; }
    public DateTime? StoppedAt { get; set; }
    public string? Error { get; set; }
}

// Audit -------------------------------------------------------------------

public class AuditEventEntity
{
    public Guid Id { get; set; }
    public Guid? ActorId { get; set; }
    public Guid? TargetId { get; set; }
    public string Action { get; set; } = "";
    public Guid? MatchId { get; set; }

    /// <summary>Free-form details (jsonb).</summary>
    public JsonElement? Details { get; set; }

    public string? Ip { get; set; }
    public string? UserAgent { get; set; }
    public DateTime CreatedAt { get; set; }
}
