using AOC.Api.Shared;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;
using Xunit;

namespace AOC.Tests.Modules;

public class TournamentAccessTests
{
    private static TournamentEntity Tournament(Visibility visibility, Guid ownerId) => new()
    {
        Id = Guid.NewGuid(),
        Name = "Cup",
        Slug = Guid.NewGuid().ToString("N")[..12],
        OwnerId = ownerId,
        Visibility = visibility,
    };

    private static UserEntity User(Guid id, UserRole role) => new()
    {
        Id = id,
        Role = role,
        Username = "u",
        DisplayName = "U",
    };

    [Fact]
    public void The_owner_sees_their_private_tournament()
    {
        var owner = Guid.NewGuid();
        var row = Tournament(Visibility.PRIVATE, owner);

        Assert.True(TournamentAccess.CanView(row, User(owner, UserRole.OPERATOR)));
    }

    [Fact]
    public void A_stranger_does_not_see_someone_elses_private_tournament()
    {
        var row = Tournament(Visibility.PRIVATE, Guid.NewGuid());

        Assert.False(TournamentAccess.CanView(row, User(Guid.NewGuid(), UserRole.OPERATOR)));
    }

    [Fact]
    public void An_admin_sees_any_private_tournament()
    {
        var row = Tournament(Visibility.PRIVATE, Guid.NewGuid());

        Assert.True(TournamentAccess.CanView(row, User(Guid.NewGuid(), UserRole.ADMIN)));
    }

    [Fact]
    public void Everyone_sees_a_public_tournament()
    {
        var row = Tournament(Visibility.PUBLIC, Guid.NewGuid());

        Assert.True(TournamentAccess.CanView(row, User(Guid.NewGuid(), UserRole.OPERATOR)));
    }

    [Fact]
    public void The_owner_writes_their_private_tournament()
    {
        var owner = Guid.NewGuid();
        var row = Tournament(Visibility.PRIVATE, owner);

        Assert.True(TournamentAccess.CanWrite(row, User(owner, UserRole.OPERATOR)));
    }

    [Fact]
    public void The_owner_writes_their_public_tournament()
    {
        var owner = Guid.NewGuid();
        var row = Tournament(Visibility.PUBLIC, owner);

        Assert.True(TournamentAccess.CanWrite(row, User(owner, UserRole.OPERATOR)));
    }

    [Fact]
    public void A_stranger_does_not_write_someone_elses_public_tournament()
    {
        var row = Tournament(Visibility.PUBLIC, Guid.NewGuid());

        Assert.False(TournamentAccess.CanWrite(row, User(Guid.NewGuid(), UserRole.OPERATOR)));
    }

    [Fact]
    public void An_admin_writes_any_tournament()
    {
        var row = Tournament(Visibility.PRIVATE, Guid.NewGuid());

        Assert.True(TournamentAccess.CanWrite(row, User(Guid.NewGuid(), UserRole.ADMIN)));
    }
}
