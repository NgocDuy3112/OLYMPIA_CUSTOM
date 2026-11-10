using Microsoft.EntityFrameworkCore;
using Olympia.Api.Http;
using Olympia.Api.Shared;
using Olympia.Infrastructure.Auth;
using Olympia.Infrastructure.Configuration;
using Olympia.Infrastructure.Data;
using Olympia.Infrastructure.Data.Entities;

namespace Olympia.Api;

/// <summary>
/// Ports of backend/scripts/*.ts — dev/ops CLI helpers invoked as
/// `dotnet run -- --mint-...`.
/// </summary>
public static class DevTools
{
    public static async Task MintGameplaySessionAsync(string? wanted)
    {
        var db = await OpenDbAsync();

        var match = await db.Matches.AsNoTracking()
            .OrderByDescending(m => m.CreatedAt)
            .FirstOrDefaultAsync();
        if (match is null)
            throw new InvalidOperationException("no match in the database — create one first");

        var seated = match.PlayersList
            .Where(s => s.Kind == "user")
            .Select(s => s.UserId)
            .ToList();
        if (seated.Count == 0)
            throw new InvalidOperationException("the match has nobody seated");

        var guids = seated.Select(Guid.Parse).ToList();
        var query = db.Users.AsNoTracking().Where(u => guids.Contains(u.Id));
        if (!string.IsNullOrEmpty(wanted))
        {
            var pattern = $"%{wanted}%";
            query = query.Where(u =>
                EF.Functions.ILike(u.DisplayName, pattern)
                || (u.Email != null && EF.Functions.ILike(u.Email, pattern)));
        }

        var player = await query.FirstOrDefaultAsync()
            ?? throw new InvalidOperationException(
                $"no seated player matches \"{wanted}\". Roster: {string.Join(", ",
                    (await db.Users.AsNoTracking().Where(u => guids.Contains(u.Id))
                        .Select(u => u.DisplayName).ToListAsync()))}");

        var tournament = await db.Tournaments.AsNoTracking()
            .FirstAsync(t => t.Id == match.TournamentId);

        var tokens = new SessionTokens();
        var token = tokens.SignSession(Surface.GAMEPLAY,
            new SessionTokenPayload(player.Id.ToString(), player.Role.ToString(), player.TokenVersion));

        var url = $"http://localhost:5175/s/{tournament.Slug}/matches/{match.Id}";

        string seatNote = "first seated";
        if (!string.IsNullOrEmpty(wanted))
        {
            seatNote = $"matched \"{wanted}\"";
        }

        Console.WriteLine($$"""
            match:  {{match.Label}} ({{match.QuestionsList.Count}} questions, rounds={{match.RoundConfigsMap.Count}})
            player: {{player.DisplayName}}  ({{seatNote}})
            url:    {{url}}

            Paste this in the browser console on localhost:5175 (or DevTools → Application → Cookies):

              document.cookie = "gameplay_session={{token}}; path=/"

            Then reload. Sign-out = delete the cookie. Re-run with a name/email to mint another.
            """);
    }

    public static async Task MintPortalSessionAsync(string username)
    {
        var db = await OpenDbAsync();
        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Username == username)
            ?? throw new InvalidOperationException($"no user with username \"{username}\"");
        if (user.Role is not (UserRole.ADMIN or UserRole.OPERATOR))
            throw new InvalidOperationException(
                $"\"{username}\" is {user.Role} — only staff sign in to the portal");

        var tokens = new SessionTokens();
        var cookie = tokens.SignSession(Surface.PORTAL,
            new SessionTokenPayload(user.Id.ToString(), user.Role.ToString(), user.TokenVersion));
        Console.WriteLine($"portal_session={cookie}");
    }

    public static async Task MintMcpKeyAsync(string label)
    {
        var db = await OpenDbAsync();
        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Role == UserRole.ADMIN)
            ?? throw new InvalidOperationException(
                "No ADMIN user found — seed one first (dotnet run -- --seed-admin)");

        var keys = new Olympia.Api.Modules.McpKeys.McpKeysService(db);
        var issued = await keys.CreateMcpKeyAsync(user.Id, label, null, null);

        Console.WriteLine("\nToken (shown exactly once — copy it now):\n");
        Console.WriteLine(issued.Token);
        Console.WriteLine($"\nkey id: {issued.Key.Id}");
        Console.WriteLine($"scopes: {string.Join(", ", issued.Key.Scopes)}");
        Console.WriteLine($"owner:  {user.Username} ({user.Id})\n");
    }

    private static async Task<OlympiaDbContext> OpenDbAsync()
    {
        var options = new DbContextOptionsBuilder<OlympiaDbContext>()
            .Configure<OlympiaDbContext>(AppConfig.Instance.DatabaseUrl)
            .Options;
        return new OlympiaDbContext(options);
    }
}
