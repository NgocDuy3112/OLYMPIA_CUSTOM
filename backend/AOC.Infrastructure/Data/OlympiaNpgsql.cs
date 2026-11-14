using Microsoft.EntityFrameworkCore;
using AOC.Domain.Contracts;

namespace AOC.Infrastructure.Data;

/// <summary>
/// Single place where every context builds its Npgsql options.
///
/// MapEnum&lt;T&gt; (options level) is the API that makes CLR enums travel as
/// native PostgreSQL enum parameters at runtime — verified against efcore.pg's
/// own functional tests. HasPostgresEnum in OnModelCreating stays as well: it
/// feeds EF migrations DDL for future schema changes.
/// </summary>
public static class AOCNpgsql
{
    /// <summary>
    /// The full connection string as configured. EF's GetConnectionString()
    /// hands back a REDACTED string (no password) once any connection has been
    /// opened — Npgsql drops credentials with Persist Security Info=false — so
    /// ad-hoc SQL must use this instead.
    /// </summary>
    public static string? ConfiguredConnectionString { get; private set; }

    /// <summary>Non-generic entry point (EF's AddDbContextPool lambda).</summary>
    public static DbContextOptionsBuilder Configure(
        this DbContextOptionsBuilder builder, string connectionString)
    {
        ConfiguredConnectionString = connectionString;
        builder.UseNpgsql(connectionString, npgsql =>
        {
            npgsql.UseQuerySplittingBehavior(QuerySplittingBehavior.SingleQuery);

            // Labels must equal the pg enum labels EXACTLY (PLAYER, not player) —
            // the default translator lowercases, so pass a verbatim one.
            var verbatim = new VerbatimNameTranslator();
            npgsql.MapEnum<AOC.Infrastructure.Data.UserRole>("user_role", nameTranslator: verbatim);
            npgsql.MapEnum<MatchStatus>("match_status", nameTranslator: verbatim);
            npgsql.MapEnum<MatchKind>("match_kind", nameTranslator: verbatim);
            npgsql.MapEnum<MatchEventKind>("match_event_kind", nameTranslator: verbatim);
            npgsql.MapEnum<RecordingStatus>("recording_status", nameTranslator: verbatim);
            npgsql.MapEnum<Visibility>("visibility", nameTranslator: verbatim);
            npgsql.MapEnum<QuestionStatus>("question_status", nameTranslator: verbatim);
            npgsql.MapEnum<PlayerGroup>("player_group", nameTranslator: verbatim);
            npgsql.MapEnum<QuestionKind>("question_kind", nameTranslator: verbatim);
            npgsql.MapEnum<Verdict>("verdict", nameTranslator: verbatim);
            npgsql.MapEnum<Power>("power", nameTranslator: verbatim);
        });
        builder.UseSnakeCaseNamingConvention();
        return builder;
    }

    public static DbContextOptionsBuilder<TContext> Configure<TContext>(
        this DbContextOptionsBuilder<TContext> builder, string connectionString)
        where TContext : DbContext
    {
        ((DbContextOptionsBuilder)builder).Configure(connectionString);
        return builder;
    }
}

/// <summary>Keeps enum member names byte-for-byte (PLAYER stays PLAYER).</summary>
internal sealed class VerbatimNameTranslator : Npgsql.INpgsqlNameTranslator
{
    public string TranslateTypeName(string typeName) => typeName;
    public string TranslateMemberName(string memberName) => memberName;
}
