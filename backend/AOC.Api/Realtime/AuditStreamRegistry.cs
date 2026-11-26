using Microsoft.AspNetCore.SignalR;
using AOC.Api.Modules.Audit;
using AOC.Api.Modules.Live;
using AOC.Infrastructure.Audit;

namespace AOC.Api.Realtime;

public sealed class AuditStreamRegistry(
    IHubContext<AuditStreamHub> hub,
    IServiceScopeFactory scopes) : IAuditObserver
{
    public async Task OnAuditWrittenAsync(AuditRecord record)
    {
        using var scope = scopes.CreateScope();
        var row = await scope.ServiceProvider.GetRequiredService<AuditEventStore>()
            .ReadRowAsync(record.Id);
        await hub.Clients.All.SendAsync("message", Protocol.Audit(row));
    }
}
