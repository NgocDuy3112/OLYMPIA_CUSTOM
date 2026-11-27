using Microsoft.AspNetCore.SignalR;
using AOC.Api.Http;
using AOC.Api.Modules.Live;

namespace AOC.Api.Realtime;

internal interface IRefusableHub
{
    HubCallerContext Context { get; }

    IHubCallerClients Clients { get; }

    Task RefuseAsync(ApiException error)
        => RefuseAsync(Protocol.CloseCodeFor(error.Status), error.Error, error.Message);

    async Task RefuseAsync(int? closeCode, string error, string message)
    {
        await Clients.Caller.SendAsync("message", Protocol.Error(error, message, closeCode: closeCode));
        Context.Abort();
    }
}
