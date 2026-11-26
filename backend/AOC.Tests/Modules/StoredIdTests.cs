using AOC.Api.Modules.Live;
using AOC.Domain.Contracts;
using Xunit;

namespace AOC.Tests.Modules;

public class StoredIdTests
{
    [Fact]
    public void Player_parses_a_stored_uuid()
    {
        var id = Guid.NewGuid();
        Assert.Equal(id, StoredId.Player(id.ToString()));
    }

    [Fact]
    public void Player_rejects_a_bad_stored_id_with_a_typed_error()
    {
        var error = Assert.Throws<RuleError>(() => StoredId.Player("not-a-uuid"));

        Assert.Equal("STATE_INVALID", error.Code);
        Assert.Contains("not-a-uuid", error.Message);
    }
}
