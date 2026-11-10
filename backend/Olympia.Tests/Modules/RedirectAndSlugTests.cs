using Olympia.Api.Shared;
using Olympia.Api.Modules.Tournaments;
using Xunit;

namespace Olympia.Tests.Modules;

public class RedirectTests
{
    [Theory]
    [InlineData("/s/olympia-2026/matches/42")]
    [InlineData("/")]
    [InlineData("/standings?tab=day")]
    public void KeepsSiteRelativePaths(string path)
    {
        Assert.Equal(path, Redirects.SafeNextPath(path));
    }

    [Theory]
    [InlineData("https://evil.example")]
    [InlineData("http://evil.example")]
    [InlineData("javascript:alert(1)")]
    public void RejectsOrigins(string path)
    {
        Assert.Equal("/", Redirects.SafeNextPath(path));
    }

    [Theory]
    [InlineData("//evil.example")]
    [InlineData("/\\evil.example")]
    [InlineData("/\\/evil.example")]
    public void RejectsProtocolRelative(string path)
    {
        Assert.Equal("/", Redirects.SafeNextPath(path));
    }

    [Fact]
    public void RejectsControlCharacters()
    {
        Assert.Equal("/", Redirects.SafeNextPath("/a\r\nSet-Cookie: x=1"));
        Assert.Equal("/", Redirects.SafeNextPath("/a\tb"));
        Assert.Equal("/", Redirects.SafeNextPath("/a\u0000b"));
    }

    [Fact]
    public void FallsBackForEmptyOrNull()
    {
        Assert.Equal("/", Redirects.SafeNextPath(null));
        Assert.Equal("/", Redirects.SafeNextPath(""));
    }
}

public class SlugifyTests
{
    [Fact]
    public void TransliteratesVietnameseInsteadOfDeleting()
    {
        Assert.Equal("giai-dau-olympic", TournamentsSlug.Slugify("Giải đấu Olympic"));
        Assert.Equal("duong-pho", TournamentsSlug.Slugify("Đường phố"));
        Assert.Equal("dak-lak-2026", TournamentsSlug.Slugify("Đắk Lắk 2026"));
    }

    [Fact]
    public void LeavesAsciiAloneAndTrimsSeparators()
    {
        Assert.Equal("tournament-one", TournamentsSlug.Slugify("Tournament One"));
        Assert.Equal("same-name", TournamentsSlug.Slugify("  Same   Name  "));
        Assert.Equal("", TournamentsSlug.Slugify("---"));
    }

    [Theory]
    [InlineData("Vòng bảng")]
    [InlineData("Đề")]
    [InlineData("Đường phố")]
    [InlineData("Ưu tiên — Mùa 2")]
    public void StaysInsideThePublicUrlPattern(string name)
    {
        var slug = TournamentsSlug.Slugify(name);
        Assert.Matches("^[a-z0-9-]{1,100}$", slug);
    }
}
