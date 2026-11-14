using Microsoft.EntityFrameworkCore;
using AOC.Domain.Contracts;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Infrastructure.Data;

/// <summary>
/// Maps EF Core onto the EXISTING Postgres schema (owned by backend/migrations).
/// No schema is created from here — EF migrations are only for future changes.
/// </summary>
public class AOCDbContext(DbContextOptions<AOCDbContext> options) : DbContext(options)
{
    public static List<string>? Debug_EnumAnnotationsDuringBuild;
    // Auth
    public DbSet<UserEntity> Users => Set<UserEntity>();
    public DbSet<OauthAccountEntity> OauthAccounts => Set<OauthAccountEntity>();
    public DbSet<McpKeyEntity> McpKeys => Set<McpKeyEntity>();

    // Reference
    public DbSet<TournamentEntity> Tournaments => Set<TournamentEntity>();
    public DbSet<TournamentPlayerEntity> TournamentPlayers => Set<TournamentPlayerEntity>();
    public DbSet<QuestionImportBatchEntity> QuestionImportBatches => Set<QuestionImportBatchEntity>();
    public DbSet<QuestionImportRowEntity> QuestionImportRows => Set<QuestionImportRowEntity>();
    public DbSet<QuestionBankEntity> QuestionBank => Set<QuestionBankEntity>();

    // Game
    public DbSet<MatchEntity> Matches => Set<MatchEntity>();
    public DbSet<MatchCodeEntity> MatchCodes => Set<MatchCodeEntity>();
    public DbSet<AnswerEntity> Answers => Set<AnswerEntity>();
    public DbSet<MatchResultEntity> MatchResults => Set<MatchResultEntity>();
    public DbSet<ScoreAdjustmentEntity> ScoreAdjustments => Set<ScoreAdjustmentEntity>();
    public DbSet<TournamentStandingEntity> TournamentStandings => Set<TournamentStandingEntity>();
    public DbSet<MatchStatEntity> MatchStats => Set<MatchStatEntity>();
    public DbSet<MatchEventEntity> MatchEvents => Set<MatchEventEntity>();
    public DbSet<MatchLiveEntity> MatchLive => Set<MatchLiveEntity>();
    public DbSet<MatchAssemblyEventEntity> MatchAssemblyEvents => Set<MatchAssemblyEventEntity>();
    public DbSet<RecordingEntity> Recordings => Set<RecordingEntity>();

    // Audit
    public DbSet<AuditEventEntity> AuditEvents => Set<AuditEventEntity>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Naming convention is applied at options level: options.UseSnakeCaseNamingConvention().

        // Native pg enum mappings (labels == member names; schema is public).
        modelBuilder.HasPostgresEnum<UserRole>(name: "user_role");
        modelBuilder.HasPostgresEnum<MatchStatus>(name: "match_status");
        modelBuilder.HasPostgresEnum<MatchKind>(name: "match_kind");
        modelBuilder.HasPostgresEnum<MatchEventKind>(name: "match_event_kind");
        modelBuilder.HasPostgresEnum<RecordingStatus>(name: "recording_status");
        modelBuilder.HasPostgresEnum<Visibility>(name: "visibility");
        modelBuilder.HasPostgresEnum<QuestionStatus>(name: "question_status");
        modelBuilder.HasPostgresEnum<PlayerGroup>(name: "player_group");
        modelBuilder.HasPostgresEnum<QuestionKind>(name: "question_kind");
        modelBuilder.HasPostgresEnum<Verdict>(name: "verdict");
        modelBuilder.HasPostgresEnum<Power>(name: "power");
        Debug_EnumAnnotationsDuringBuild = modelBuilder.Model.GetAnnotations()
            .Where(a => a.Name.Contains("Enum"))
            .Select(a => a.Name)
            .ToList();

        // ---- users ----
        modelBuilder.Entity<UserEntity>(e =>
        {
            e.ToTable("users");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.Username).IsUnique();
            e.HasIndex(x => x.Email).IsUnique();
            e.HasIndex(x => x.DiscordId).IsUnique();
            e.Property(x => x.Role).IsRequired();
            e.Property(x => x.Username).IsRequired().HasMaxLength(50);
            e.Property(x => x.Email).HasMaxLength(255);
            e.Property(x => x.DisplayName).IsRequired().HasMaxLength(100);
            e.Property(x => x.DiscordId).HasMaxLength(30);
            e.Property(x => x.EmailVerified).HasDefaultValue(false);
            e.Property(x => x.MustChangePassword).HasDefaultValue(false);
            e.Property(x => x.TokenVersion).HasDefaultValue(0);
            e.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
            e.Property(x => x.UpdatedAt).HasDefaultValueSql("now()");
        });

        modelBuilder.Entity<OauthAccountEntity>(e =>
        {
            e.ToTable("oauth_accounts");
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.Provider, x.Sub }).IsUnique();
            e.Property(x => x.Provider).IsRequired().HasMaxLength(32);
            e.Property(x => x.Sub).IsRequired();
            e.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
        });

        modelBuilder.Entity<McpKeyEntity>(e =>
        {
            e.ToTable("mcp_keys");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.KeyHash).IsUnique();
            e.HasIndex(x => x.UserId);
            e.Property(x => x.Prefix).IsRequired().HasMaxLength(20);
            e.Property(x => x.KeyHash).IsRequired();
            e.Property(x => x.Label).IsRequired();
            e.Property(x => x.LastIp).HasMaxLength(45);
            e.Property(x => x.Scopes).HasDefaultValue(new[] { "READ" });
            e.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
            e.Property(x => x.LastUsedAt).HasDefaultValueSql("now()");
        });

        // ---- reference ----
        modelBuilder.Entity<TournamentEntity>(e =>
        {
            e.ToTable("tournaments");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.Slug).IsUnique();
            e.HasIndex(x => x.OwnerId).IsUnique().HasFilter("current = true");
            e.Property(x => x.Slug).IsRequired().HasMaxLength(100);
            e.Property(x => x.Name).IsRequired();
            e.Property(x => x.Visibility).HasDefaultValue(Visibility.PUBLIC);
            e.Property(x => x.Current).HasDefaultValue(false);
            e.Property(x => x.Rounds).HasColumnType("jsonb").IsRequired();
            e.Property(x => x.Format).HasColumnType("jsonb").IsRequired();
            e.Property(x => x.Stages).HasColumnType("jsonb").IsRequired();
            e.Property(x => x.RoundRules).HasColumnType("jsonb");
            e.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
            e.Property(x => x.UpdatedAt).HasDefaultValueSql("now()");
        });

        modelBuilder.Entity<TournamentPlayerEntity>(e =>
        {
            e.ToTable("tournament_players");
            e.HasKey(x => new { x.TournamentId, x.UserId });
            e.Property(x => x.EnrolledAt).HasDefaultValueSql("now()");
        });

        modelBuilder.Entity<QuestionImportBatchEntity>(e =>
        {
            e.ToTable("question_import_batches");
            e.HasKey(x => x.Id);
            e.Property(x => x.RowCount).HasDefaultValue(0);
            e.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
            e.Property(x => x.UpdatedAt).HasDefaultValueSql("now()");
        });

        modelBuilder.Entity<QuestionImportRowEntity>(e =>
        {
            e.ToTable("question_import_rows");
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.BatchId, x.Position }).IsUnique();
            e.Property(x => x.Sheet).IsRequired();
            e.Property(x => x.SourceId).IsRequired();
            e.Property(x => x.Cells).HasColumnType("jsonb").IsRequired();
            e.Property(x => x.Media).HasColumnType("jsonb");
            e.Property(x => x.Dropped).HasDefaultValue(false);
            e.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
            e.Property(x => x.UpdatedAt).HasDefaultValueSql("now()");
        });

        modelBuilder.Entity<QuestionBankEntity>(e =>
        {
            e.ToTable("question_bank");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.Status);
            e.HasIndex(x => x.KeywordId);
            e.Property(x => x.QuestionText).IsRequired();
            e.Property(x => x.Payload).HasColumnType("jsonb").IsRequired();
            e.Property(x => x.Media).HasColumnType("jsonb");
            e.Property(x => x.Tags).HasColumnType("text[]").HasDefaultValue(new string[0]);
            // GENERATED ALWAYS AS (payload ->> 'type') STORED — never written by EF.
            e.Property(x => x.Type)
                .HasComputedColumnSql("(payload ->> 'type')")
                .IsRequired();
            e.Property(x => x.Status).HasDefaultValue(QuestionStatus.DRAFT);
            e.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
            e.Property(x => x.UpdatedAt).HasDefaultValueSql("now()");
            e.ToTable(t => t.HasCheckConstraint(
                "question_bank_hint_needs_keyword",
                "kind <> 'HINT' OR keyword_id IS NOT NULL"));
        });

        // ---- game ----
        modelBuilder.Entity<MatchEntity>(e =>
        {
            e.ToTable("matches");
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.TournamentId, x.Status });
            e.HasIndex(x => new { x.TournamentId, x.StageId, x.Slot })
                .IsUnique()
                .HasFilter("deleted_at IS NULL AND slot IS NOT NULL");
            e.HasIndex(x => x.Players).HasMethod("gin");
            e.Property(x => x.StageId).IsRequired();
            e.Property(x => x.Label).IsRequired();
            e.Property(x => x.Status).HasDefaultValue(MatchStatus.UPCOMING);
            e.Property(x => x.Kind).HasDefaultValue(MatchKind.STANDARD);
            e.Property(x => x.Players).HasColumnType("jsonb").IsRequired();
            e.Property(x => x.RoundConfigs).HasColumnType("jsonb").IsRequired();
            e.Property(x => x.Questions).HasColumnType("jsonb").IsRequired();
            e.Property(x => x.Live).HasColumnType("jsonb");
            e.Property(x => x.Discord).HasColumnType("jsonb");
            e.Property(x => x.AssemblyRevision).HasDefaultValue(0);
            e.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
            e.Property(x => x.UpdatedAt).HasDefaultValueSql("now()");
            e.ToTable(t => t.HasCheckConstraint(
                "matches_live_phase_check",
                "live IS NULL OR jsonb_typeof(live->'phase') = 'string'"));
        });

        modelBuilder.Entity<MatchCodeEntity>(e =>
        {
            e.ToTable("match_codes");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.Code).IsUnique();
            e.HasIndex(x => x.MatchId);
            e.Property(x => x.Code).IsRequired().HasMaxLength(6);
            e.Property(x => x.ExpiresAt).IsRequired();
            e.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
        });

        modelBuilder.Entity<AnswerEntity>(e =>
        {
            e.ToTable("answers");
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.MatchId, x.QuestionId, x.UserId }).IsUnique();
            e.HasIndex(x => x.MatchId);
            e.Property(x => x.Value).HasColumnType("jsonb").IsRequired();
            e.Property(x => x.Drafts).HasColumnType("jsonb");
            e.Property(x => x.AutoMatched).HasDefaultValue(false);
            e.Property(x => x.Judged).HasDefaultValue(false);
            e.Property(x => x.SubmittedAt).HasDefaultValueSql("now()");
            e.ToTable(t => t.HasCheckConstraint(
                "answers_value_object_check",
                "jsonb_typeof(value) = 'object' AND value <> '{}'::jsonb"));
        });

        modelBuilder.Entity<MatchResultEntity>(e =>
        {
            e.ToTable("match_results");
            e.HasKey(x => x.MatchId);
            e.Property(x => x.Results).HasColumnType("jsonb").IsRequired();
            e.Property(x => x.ComputedAt).HasDefaultValueSql("now()");
        });

        modelBuilder.Entity<ScoreAdjustmentEntity>(e =>
        {
            e.ToTable("score_adjustments");
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.MatchId, x.UserId });
            e.Property(x => x.Reason).IsRequired().HasMaxLength(200);
            e.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
        });

        modelBuilder.Entity<TournamentStandingEntity>(e =>
        {
            e.ToTable("tournament_standings");
            e.HasKey(x => new { x.TournamentId, x.UserId });
            e.Property(x => x.ComputedAt).HasDefaultValueSql("now()");
        });

        modelBuilder.Entity<MatchStatEntity>(e =>
        {
            e.ToTable("match_stats");
            e.HasKey(x => new { x.MatchId, x.RoundId, x.QuestionId, x.UserId });
            e.HasIndex(x => new { x.TournamentId, x.RoundId });
            e.Property(x => x.RoundId).IsRequired();
            e.ToTable(t => t.HasCheckConstraint(
                "match_stats_question_grain_check",
                "question_id IS NOT NULL"));
        });

        modelBuilder.Entity<MatchEventEntity>(e =>
        {
            e.ToTable("match_events");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.MatchId);
            e.HasIndex(x => new { x.MatchId, x.QuestionId })
                .IsUnique()
                .HasFilter("kind = 'PICK'");
            e.HasIndex(x => new { x.MatchId, x.QuestionId, x.UserId })
                .IsUnique()
                .HasFilter("kind = 'BUZZ'");
            // NOTE: the partial POWER unique index uses the expression
            // (payload->>'power') and is owned by migrations/ — configure it
            // by hand if a future EF migration ever recreates this table.
            e.Property(x => x.Payload).HasColumnType("jsonb").IsRequired();
            e.Property(x => x.At).HasDefaultValueSql("now()");
            e.ToTable(t => t.HasCheckConstraint(
                "match_events_payload_kind_check",
                "payload->>'kind' = kind::text"));
            e.ToTable(t => t.HasCheckConstraint(
                "match_events_power_round_check",
                "kind <> 'POWER' OR round_id IS NOT NULL"));
        });

        modelBuilder.Entity<MatchLiveEntity>(e =>
        {
            e.ToTable("match_live");
            e.HasKey(x => x.MatchId);
            e.Property(x => x.Version).HasDefaultValue(0);
            e.Property(x => x.RoundId).IsRequired();
            e.Property(x => x.State).HasColumnType("jsonb").IsRequired();
            e.Property(x => x.Archive).HasColumnType("jsonb").IsRequired()
                .HasDefaultValueSql("'{}'::jsonb");
            e.Property(x => x.UpdatedAt).HasDefaultValueSql("now()");
            e.ToTable(t => t.HasCheckConstraint(
                "match_live_version_check",
                "version >= 0"));
        });

        modelBuilder.Entity<MatchAssemblyEventEntity>(e =>
        {
            e.ToTable("match_assembly_events");
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.MatchId, x.Revision });
            e.Property(x => x.Mode).HasDefaultValue("replace");
            e.Property(x => x.AddedCount).HasDefaultValue(0);
            e.Property(x => x.RemovedCount).HasDefaultValue(0);
            e.Property(x => x.SourceIds).HasColumnType("text[]").IsRequired();
            e.Property(x => x.At).HasDefaultValueSql("now()");
        });

        modelBuilder.Entity<RecordingEntity>(e =>
        {
            e.ToTable("recordings");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.EgressId).IsUnique();
            e.HasIndex(x => x.MatchId).IsUnique().HasFilter("status = 'RECORDING'");
            e.Property(x => x.StartedAt).HasDefaultValueSql("now()");
        });

        // ---- audit ----
        modelBuilder.Entity<AuditEventEntity>(e =>
        {
            e.ToTable("audit_events");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.ActorId);
            e.HasIndex(x => x.TargetId);
            e.HasIndex(x => x.MatchId);
            e.Property(x => x.Action).IsRequired().HasMaxLength(100);
            e.Property(x => x.Details).HasColumnType("jsonb");
            e.Property(x => x.Ip).HasMaxLength(45);
            e.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
        });
    }
}
