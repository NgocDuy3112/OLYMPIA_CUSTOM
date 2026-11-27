using Microsoft.AspNetCore.SignalR;
using AOC.Api.Http;
using AOC.Infrastructure.Configuration;

namespace AOC.Api.Realtime;

public sealed class AuditStreamHub : Hub, IRefusableHub
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
            await ((IRefusableHub)this).RefuseAsync(ex);
            return;
        }

        await base.OnConnectedAsync();
    }
}
