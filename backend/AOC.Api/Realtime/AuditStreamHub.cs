using Microsoft.AspNetCore.SignalR;
using AOC.Api.Http;
using AOC.Api.Modules.Live;
using AOC.Infrastructure.Configuration;

namespace AOC.Api.Realtime;

public sealed class AuditStreamHub : Hub
{
    public override async Task OnConnectedAsync()
    {
        var http = Context.GetHttpContext()!;
        try
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN");
        }
        catch (ApiException ex)
        {
            await Clients.Caller.SendAsync("message",
                Protocol.Error(ex.Error, ex.Message, closeCode: Protocol.CloseCodeFor(ex.Status)));
            Context.Abort();
            return;
        }

        await base.OnConnectedAsync();
    }
}
