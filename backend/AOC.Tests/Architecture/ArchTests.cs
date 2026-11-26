using Xunit;

namespace AOC.Tests.Architecture;

public class ArchTests
{
    private static readonly string[] GrandfatheredRouteFiles_WhoseServiceClassSharesTheFile =
    [
        "Auth/PlayerAccountRoutes.cs",
        "Questions/Import/QuestionStagingRoutes.cs"
    ];

    private static readonly string[] GrandfatheredRawConnectionFiles =
    [
        "Modules/Auth/PlayerAccountRoutes.cs",
        "Modules/Matches/AssemblePatch.cs"
    ];

    private static readonly Dictionary<string, int> DictionaryBaseline = new()
    {
        ["Http/ErrorHandlingMiddleware.cs"] = 7,
        ["Modules/Live/LiveRoutes.cs"] = 6,
        ["Modules/Live/Service/LiveService.cs"] = 8,
        ["Modules/Live/Wire/Protocol.cs"] = 6,
        ["Modules/Live/Submit.cs"] = 1,
        ["Modules/Live/TieBreak/TieBreakRoutes.cs"] = 2,
        ["Modules/Live/View/LiveFacts.cs"] = 8,
        ["Modules/Live/ButPha/LiveView.ButPha.cs"] = 1,
        ["Modules/Live/View/LiveView.cs"] = 5,
        ["Modules/Live/GiaiMa/LiveView.GiaiMa.cs"] = 6,
        ["Modules/Live/KhoiDong/LiveView.KhoiDong.cs"] = 3,
        ["Modules/Live/VeDich/LiveView.VeDich.cs"] = 4,
        ["Modules/MatchCodes/MatchCodesService.cs"] = 2,
        ["Modules/Matches/MatchRoutes.cs"] = 1,
        ["Modules/Matches/MatchScoringRoutes.cs"] = 2,
        ["Modules/Mcp/McpTools.cs"] = 6,
        ["Modules/McpKeys/McpKeyRoutes.cs"] = 2,
        ["Modules/Questions/Crud/QuestionRoutes.cs"] = 1,
        ["Modules/Questions/Import/QuestionStagingRoutes.cs"] = 1,
        ["Modules/Questions/Crud/QuestionsService.cs"] = 1,
        ["Modules/Roster/RosterRoutes.cs"] = 4,
        ["Modules/Standings/StandingsRoutes.cs"] = 1
    };

    [Fact]
    public void Routes_must_not_touch_DbContext()
    {
        var modules = Path.Combine(ApiRoot(), "Modules");
        var offenders = Directory.EnumerateFiles(modules, "*Routes.cs", SearchOption.AllDirectories)
            .Where(path => File.ReadAllText(path).Contains("AOCDbContext"))
            .Select(path => Relative(modules, path))
            .ToList();

        Assert.Empty(offenders.Except(GrandfatheredRouteFiles_WhoseServiceClassSharesTheFile));
    }

    [Fact]
    public void Routes_must_use_the_shared_tournament_access_seam()
    {
        var modules = Path.Combine(ApiRoot(), "Modules");
        var offenders = Directory.EnumerateFiles(modules, "*Routes.cs", SearchOption.AllDirectories)
            .Where(path =>
            {
                var text = File.ReadAllText(path);
                return text.Contains("TournamentAccess.CanView")
                    || text.Contains("TournamentAccess.CanWrite");
            })
            .Select(path => Relative(modules, path))
            .ToList();

        Assert.Empty(offenders);
    }

    [Fact]
    public void No_new_raw_connection_outside_the_known_two()
    {
        var root = ApiRoot();
        var offenders = SourceFiles(root)
            .Where(path => OpensRawConnection(File.ReadAllText(path)))
            .Select(path => Relative(root, path))
            .ToList();

        Assert.Empty(offenders.Except(GrandfatheredRawConnectionFiles));
    }

    [Fact]
    public void Raw_connection_grandfather_list_matches_the_code()
    {
        var root = ApiRoot();
        var expected = string.Join("\n", GrandfatheredRawConnectionFiles.Order(StringComparer.Ordinal));
        var actual = string.Join("\n", SourceFiles(root)
            .Where(path => OpensRawConnection(File.ReadAllText(path)))
            .Select(path => Relative(root, path))
            .Order(StringComparer.Ordinal));

        Assert.Equal(expected, actual);
    }

    [Fact]
    public void Untyped_payload_dictionaries_do_not_grow()
    {
        var root = ApiRoot();
        var actual = SourceFiles(root)
            .Select(path => new
            {
                Path = Relative(root, path),
                Count = File.ReadAllText(path).Split("new Dictionary<string, object?>").Length - 1
            })
            .Where(row => row.Count > 0)
            .ToList();

        var offenders = new List<string>();
        foreach (var row in actual)
        {
            if (!DictionaryBaseline.TryGetValue(row.Path, out var allowed))
            {
                offenders.Add($"{row.Path}: {row.Count} not in baseline");
            }
            else if (row.Count > allowed)
            {
                offenders.Add($"{row.Path}: {row.Count} > {allowed}");
            }
        }

        Assert.Empty(offenders);
    }

    private static bool OpensRawConnection(string text)
    {
        if (text.Contains("NpgsqlConnection")) return true;
        return text.Contains("RawSql.OpenAsync");
    }

    private static IEnumerable<string> SourceFiles(string root)
        => Directory.EnumerateFiles(root, "*.cs", SearchOption.AllDirectories);

    private static string Relative(string root, string path)
        => Path.GetRelativePath(root, path).Replace('\\', '/');

    private static string ApiRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !Directory.Exists(Path.Combine(directory.FullName, "AOC.Api")))
            directory = directory.Parent;
        if (directory is null)
            throw new InvalidOperationException("AOC.Api not found above " + AppContext.BaseDirectory);
        return Path.Combine(directory.FullName, "AOC.Api");
    }
}
