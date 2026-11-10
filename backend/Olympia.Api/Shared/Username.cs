using System.Globalization;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Olympia.Infrastructure.Data;

namespace Olympia.Api.Shared;

/// <summary>Port of lib/username.ts — handle slugging and collision-free picking.</summary>
public static class Usernames
{
    private const int MaxHandle = 45;

    public static string Slugify(string raw)
    {
        var ascii = raw.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(ascii.Length);
        foreach (var c in ascii)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                sb.Append(c);
        }
        var slug = sb.ToString()
            .Normalize(NormalizationForm.FormC)
            .ToLowerInvariant()
            .Replace('đ', 'd');

        var builder = new StringBuilder(slug.Length);
        foreach (var c in slug)
            builder.Append(char.IsLetterOrDigit(c) ? c : '-');
        var dashed = builder.ToString().Trim('-');
        if (dashed.Length > MaxHandle) dashed = dashed[..MaxHandle];
        dashed = dashed.TrimEnd('-');
        return dashed.Length > 0 ? dashed : "player";
    }

    public static async Task<string> PickUsernameAsync(OlympiaDbContext db, string displayName)
    {
        var baseName = Slugify(displayName);

        for (var n = 1; n <= 50; n += 1)
        {
            var candidate = n == 1 ? baseName : $"{baseName}-{n}";
            var taken = await db.Users.AnyAsync(u => u.Username.ToLower() == candidate);
            if (!taken) return candidate;
        }

        return $"{baseName}-{Random.Shared.Next(100, 1000)}";
    }
}
