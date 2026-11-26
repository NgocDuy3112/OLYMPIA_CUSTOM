using Microsoft.EntityFrameworkCore;
using Npgsql;
using AOC.Api.Shared;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;
using AOC.Infrastructure.Oidc;

namespace AOC.Api.Modules.Auth;

public sealed class GoogleAuthService(AOCDbContext db)
{
    public async Task<UserEntity> FindOrCreatePlayerAsync(GoogleClaims claims)
    {
        try
        {
            return await ProvisionPlayerAsync(claims);
        }
        catch (DbUpdateException error) when (IsUniqueViolation(error))
        {
            var linked = await db.OauthAccounts
                .FirstOrDefaultAsync(a => a.Provider == "google" && a.Sub == claims.Sub);
            if (linked is null) throw;

            var user = await db.Users.FirstOrDefaultAsync(u => u.Id == linked.UserId)
                ?? throw new SignInException("OAuth account points to a missing user");
            if (user.DisabledAt is not null) throw new SignInException("Account disabled");
            return user;
        }
    }

    private async Task<UserEntity> ProvisionPlayerAsync(GoogleClaims claims)
    {
        var linked = await db.OauthAccounts
            .FirstOrDefaultAsync(a => a.Provider == "google" && a.Sub == claims.Sub);

        if (linked is not null)
        {
            var user = await db.Users.FirstOrDefaultAsync(u => u.Id == linked.UserId)
                ?? throw new SignInException("OAuth account points to a missing user");
            if (user.DisabledAt is not null) throw new SignInException("Account disabled");

            user.DisplayName = claims.Name ?? user.DisplayName;
            user.AvatarUrl = claims.Picture ?? user.AvatarUrl;
            user.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return user;
        }

        var email = claims.Email;
        if (string.IsNullOrEmpty(email) || claims.EmailVerified != true)
            throw new SignInException("Your Google account has no verified email address");

        var byEmail = await db.Users.FirstOrDefaultAsync(u => u.Email == email);
        if (byEmail is not null)
        {
            if (byEmail.DisabledAt is not null) throw new SignInException("Account disabled");
            db.OauthAccounts.Add(new OauthAccountEntity
            {
                UserId = byEmail.Id,
                Provider = "google",
                Sub = claims.Sub!
            });
            await db.SaveChangesAsync();
            return byEmail;
        }

        for (var attempt = 1; ; attempt += 1)
        {
            try
            {
                var displayName = claims.Name ?? email;
                var username = await Usernames.PickUsernameAsync(db,
                    claims.Name ?? email.Split('@')[0]);

                var created = new UserEntity
                {
                    Role = UserRole.PLAYER,
                    Username = username,
                    Email = email,
                    EmailVerified = true,
                    DisplayName = displayName,
                    AvatarUrl = claims.Picture
                };
                db.Users.Add(created);
                await db.SaveChangesAsync();

                db.OauthAccounts.Add(new OauthAccountEntity
                {
                    UserId = created.Id,
                    Provider = "google",
                    Sub = claims.Sub!
                });
                await db.SaveChangesAsync();
                return created;
            }
            catch (DbUpdateException error) when (attempt < 2 && IsUniqueViolation(error))
            {
            }
        }
    }

    private static bool IsUniqueViolation(DbUpdateException ex)
        => ex.InnerException is PostgresException { SqlState: "23505" };
}
