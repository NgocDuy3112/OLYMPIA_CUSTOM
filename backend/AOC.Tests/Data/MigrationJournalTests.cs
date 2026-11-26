using AOC.Infrastructure.Data;
using Xunit;

namespace AOC.Tests.Data;

public class MigrationJournalTests
{
    private static MigrationJournalEntry Entry(int idx, string tag, long when)
        => new(idx, tag, when);

    private static Dictionary<string, string> Hashes(params (string Tag, string Hash)[] rows)
        => rows.ToDictionary(r => r.Tag, r => r.Hash);

    [Fact]
    public void An_older_when_after_a_newer_one_is_still_applied()
    {
        var entries = new[]
        {
            Entry(0, "0000_baseline", 2000),
            Entry(1, "0001_backdated", 1000),
            Entry(2, "0002_third", 3000)
        };
        var applied = new[] { "h0" };
        var hashes = Hashes(("0000_baseline", "h0"), ("0001_backdated", "h1"), ("0002_third", "h2"));

        var pending = MigrationRunner.PendingEntries(entries, applied, hashes);

        Assert.Equal(["0001_backdated", "0002_third"], pending.Select(p => p.Tag));
    }

    [Fact]
    public void Nothing_is_pending_when_every_journal_entry_is_recorded()
    {
        var entries = new[] { Entry(0, "0000_baseline", 2000), Entry(1, "0001_next", 3000) };
        var applied = new[] { "h0", "h1" };
        var hashes = Hashes(("0000_baseline", "h0"), ("0001_next", "h1"));

        Assert.Empty(MigrationRunner.PendingEntries(entries, applied, hashes));
    }

    [Fact]
    public void A_changed_applied_file_fails_with_the_entry_context()
    {
        var entries = new[] { Entry(0, "0000_baseline", 2000), Entry(1, "0001_next", 3000) };
        var applied = new[] { "h0", "h1" };
        var hashes = Hashes(("0000_baseline", "h0"), ("0001_next", "edited"));

        var error = Assert.Throws<InvalidOperationException>(
            () => MigrationRunner.PendingEntries(entries, applied, hashes));

        Assert.Contains("0001_next", error.Message);
        Assert.Contains("recorded hash h1", error.Message);
        Assert.Contains("file hash edited", error.Message);
    }

    [Fact]
    public void More_recorded_migrations_than_journal_entries_fails()
    {
        var entries = new[] { Entry(0, "0000_baseline", 2000) };
        var applied = new[] { "h0", "h1" };
        var hashes = Hashes(("0000_baseline", "h0"));

        var error = Assert.Throws<InvalidOperationException>(
            () => MigrationRunner.PendingEntries(entries, applied, hashes));

        Assert.Contains("2 migrations are recorded", error.Message);
    }

    [Fact]
    public void A_journal_whose_idx_goes_backwards_fails()
    {
        var entries = new[] { Entry(1, "0000_baseline", 2000), Entry(0, "0001_next", 3000) };

        var error = Assert.Throws<InvalidOperationException>(
            () => MigrationRunner.PendingEntries(entries, [], Hashes()));

        Assert.Contains("not monotonic", error.Message);
    }
}
