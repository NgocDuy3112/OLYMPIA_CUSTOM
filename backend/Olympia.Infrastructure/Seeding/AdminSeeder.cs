using Microsoft.EntityFrameworkCore;
using Olympia.Infrastructure.Auth;
using Olympia.Infrastructure.Configuration;
using Olympia.Infrastructure.Data;
using Olympia.Infrastructure.Data.Entities;

namespace Olympia.Infrastructure.Seeding;

/// <summary>Port of db/seed.ts — create the first admin account.</summary>
public static class AdminSeeder
{
    private const int MinPasswordLength = 12;

    public static async Task<int> RunAsync(string connectionString)
    {
        var config = AppConfig.Instance;
        var password = config.SeedAdminPassword
            ?? throw new InvalidOperationException("Missing required environment variable: SEED_ADMIN_PASSWORD");
        if (password.Length < MinPasswordLength)
            throw new InvalidOperationException(
                "SEED_ADMIN_PASSWORD must be at least 12 characters");
        var username = config.SeedAdminUsername;

        var options = new DbContextOptionsBuilder<OlympiaDbContext>()
            .Configure<OlympiaDbContext>(connectionString)
            .Options;
        await using var db = new OlympiaDbContext(options);

        var existing = await db.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.Username == username);
        if (existing is not null)
        {
            if (existing.Role != UserRole.ADMIN)
                throw new InvalidOperationException(
                    $"Username \"{username}\" is taken by a {existing.Role}; pick another via SEED_ADMIN_USERNAME");
            Console.WriteLine($"Admin \"{username}\" already exists — nothing to do.");
            return 0;
        }

        db.Users.Add(new UserEntity
        {
            Role = UserRole.ADMIN,
            Username = username,
            DisplayName = username,
            PasswordHash = await PasswordHasher.HashAsync(password)
        });
        await db.SaveChangesAsync();

        Console.WriteLine($"Admin \"{username}\" created.");
        Console.WriteLine("TOTP enrollment happens on first login.");
        return 0;
    }
}
