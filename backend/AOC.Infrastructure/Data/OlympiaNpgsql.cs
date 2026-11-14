using Microsoft.EntityFrameworkCore;
using AOC.Domain.Contracts;

namespace AOC.Infrastructure.Data;

public static class AOCNpgsql
{
    public static string? ConfiguredConnectionString { get; private set; }

    public static DbContextOptionsBuilder Configure(
        this DbContextOptionsBuilder builder, string connectionString)
    {
        ConfiguredConnectionString = connectionString;
        builder.UseNpgsql(connectionString, npgsql =>
        {
            npgsql.UseQuerySplittingBehavior(QuerySplittingBehavior.SingleQuery);

            var verbatim = new VerbatimNameTranslator();
            npgsql.MapEnum<AOC.Infrastructure.Data.UserRole>("user_role", nameTranslator: verbatim);
            npgsql.MapEnum<MatchStatus>("match_status", nameTranslator: verbatim);
            npgsql.MapEnum<MatchKind>("match_kind", nameTranslator: verbatim);
            npgsql.MapEnum<MatchEventKind>("match_event_kind", nameTranslator: verbatim);
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

internal sealed class VerbatimNameTranslator : Npgsql.INpgsqlNameTranslator
{
    public string TranslateTypeName(string typeName) => typeName;
    public string TranslateMemberName(string memberName) => memberName;
}
