using System.Text.Json;
using Microsoft.Extensions.Logging;
using AOC.Domain.Contracts;

namespace AOC.Infrastructure.Data.Entities;


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


public class TournamentEntity
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string Slug { get; set; } = "";
    public Visibility Visibility { get; set; } = Visibility.PUBLIC;
    public Guid OwnerId { get; set; }
    public bool Current { get; set; }

    public JsonElement Rounds { get; set; }

    public JsonElement Format { get; set; }

    public JsonElement Stages { get; set; }

    public JsonElement? RoundRules { get; set; }

    public DateTime? ClosedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime? DeletedAt { get; set; }

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

public class QuestionBankEntity
{
    public Guid Id { get; set; }
    public QuestionKind Kind { get; set; }
    public string QuestionText { get; set; } = "";
    public Guid? KeywordId { get; set; }
    public JsonElement? Media { get; set; }

    public JsonElement Payload { get; set; }

    public QuestionStatus Status { get; set; } = QuestionStatus.DRAFT;
    public string[] Tags { get; set; } = [];

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

    public JsonElement Players { get; set; }

    public JsonElement RoundConfigs { get; set; }

    public JsonElement Questions { get; set; }

    public int AssemblyRevision { get; set; }
    public DateTime? AssembledAt { get; set; }
    public Guid? ControllerId { get; set; }
    public DateTime? ControllerHeartbeatAt { get; set; }
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

    public JsonElement Value { get; set; }

    public JsonElement? Drafts { get; set; }

    public int? FirstAnsweredMs { get; set; }
    public int? AnsweredMs { get; set; }
    public bool AutoMatched { get; set; }
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
    public PowerKind? Power { get; set; }
}

public class MatchEventEntity
{
    public Guid Id { get; set; }
    public Guid MatchId { get; set; }
    public Guid QuestionId { get; set; }
    public Guid UserId { get; set; }
    public string? RoundId { get; set; }
    public MatchEventKind Kind { get; set; }

    public JsonElement Payload { get; set; }

    public DateTime At { get; set; }
}

public class MatchLiveEntity
{
    public Guid MatchId { get; set; }
    public int Version { get; set; }
    public string RoundId { get; set; } = "";

    public JsonElement State { get; set; }

    public JsonElement Archive { get; set; }

    public JsonElement? Tiebreak { get; set; }

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


public class AuditEventEntity
{
    public Guid Id { get; set; }
    public Guid? ActorId { get; set; }
    public Guid? TargetId { get; set; }
    public string Action { get; set; } = "";
    public Guid? MatchId { get; set; }

    public JsonElement? Details { get; set; }

    public string? Ip { get; set; }
    public string? UserAgent { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class PasswordResetCodeEntity
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string CodeHash { get; set; } = "";
    public string Salt { get; set; } = "";
    public DateTime ExpiresAt { get; set; }
    public DateTime? UsedAt { get; set; }
    public int Attempts { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class ClaimAttemptEntity
{
    public Guid UserId { get; set; }
    public int Attempts { get; set; }
    public DateTime WindowStart { get; set; }
    public DateTime? LockedUntil { get; set; }
    public DateTime UpdatedAt { get; set; }
}
