using Xunit;

namespace AOC.Tests.Auth;

internal sealed class DbFactAttribute : FactAttribute
{
    public DbFactAttribute()
    {
        if (!AuthTestDb.DatabaseReady()) Skip = "no database on this machine";
    }
}
