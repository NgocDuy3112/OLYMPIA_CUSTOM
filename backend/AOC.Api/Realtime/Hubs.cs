using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using AOC.Api.Http;
using AOC.Api.Modules.Live;
using AOC.Api.Modules.Matches;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;
using AOC.Api.Realtime;
using AOC.Infrastructure.Auth;
using AOC.Infrastructure.Configuration;

namespace AOC.Api.Realtime;

/// <summary>
/// Port of live/routes.ts WebSocket handlers → SignalR hubs.
/// Same URLs, same envelopes: server → client method "message" with
/// { v, type: view|console|ack|error, at, requestId?, data }.
/// </summary>
public abstract class LiveHubBase(MatchHubRegistry registry) : Hub
{
    protected string MatchId = "";

    /// <summary>
    /// This connection's own proxy, captured while SignalR still fills Context and
    /// Clients: both are cleared the moment OnConnectedAsync returns, and every
    /// registry push fires later — from whatever action changed the match state.
    /// </summary>
    protected IClientProxy? Self { get; private set; }

    protected void ArmSelf(IClientProxy self) => Self = self;

    protected static string ParseMatchId(HttpContext http)
    {
        var segments = http.Request.Path.Value?.Split('/', StringSplitOptions.RemoveEmptyEntries) ?? [];
        for (var i = 0; i < segments.Length - 1; i++)
            if (segments[i] == "matches")
                return segments[i + 1];
        throw new ApiException(400, "Bad Request", "match id missing from hub path");
    }

    protected async Task<string> ResolveMatchIdAsync()
    {
        MatchId = ParseMatchId(Context.GetHttpContext()!);
        return MatchId;
    }

    protected async Task PushAsync(Dictionary<string, object?> envelope)
        => await (Self ?? Clients.Caller).SendAsync("message", envelope);

    protected Action Subscribe(string userId, Func<Task> push, string kind)
        => registry.Subscribe(MatchId, new HubSubscriber(userId, push, PushAsync, kind));
}

/// <summary>/gameplay/matches/:matchId/live/stream — seated players.</summary>
public sealed class PlayerLiveHub(
    MatchHubRegistry registry,
    SubmitService submit,
    SessionTokens tokens,
    IHubContext<PlayerLiveHub> self,
    IServiceScopeFactory scopes)
    : LiveHubBase(registry)
{
    public override async Task OnConnectedAsync()
    {
        var http = Context.GetHttpContext()!;
        // Context is nulled on release, but the session guard below outlives it.
        var hubContext = Context;
        ArmSelf(self.Clients.Client(Context.ConnectionId));
        try
        {
            await ResolveMatchIdAsync();
        }
        catch (ApiException ex)
        {
            await Clients.Caller.SendAsync("message", Protocol.Error(ex.Error, ex.Message));
            Context.Abort();
            return;
        }

        // Guards.RequireAuth (gameplay cookie + password-change gate).
        UserEntity user;
        try
        {
            user = await http.RequireAuthAsync(Surface.GAMEPLAY);
        }
        catch (ApiException ex)
        {
            await Clients.Caller.SendAsync("message", Protocol.Error(ex.Error, ex.Message));
            Context.Abort();
            return;
        }

        var matches = http.RequestServices.GetRequiredService<MatchesService>();
        var match = await matches.GetMatchByIdAsync(MatchId);
        if (!MatchSeats.IsSeatedInMatch(match.PlayersList, user.Id))
        {
            // TS closed the socket with 4403 NOT_SEATED.
            await Clients.Caller.SendAsync("message",
                Protocol.Error("NOT_SEATED", "not a player in this match"));
            Context.Abort();
            return;
        }

        var userId = user.Id;
        var tokenVersion = user.TokenVersion;

        async Task SendAsync()
        {
            // Registry pushes fire long after this connection's scope was disposed,
            // so read the state through a scope of our own.
            using var scope = scopes.CreateScope();
            var provider = scope.ServiceProvider;
            var matchRow = await provider.GetRequiredService<MatchesService>().GetMatchByIdAsync(MatchId);
            var liveSnapshot = await provider.GetRequiredService<LiveReader>().ReadLiveAsync(Guid.Parse(MatchId));
            if (matchRow.Status != MatchStatus.LIVE || liveSnapshot is null)
            {
                await PushAsync(Protocol.Error("UNAVAILABLE", "the match is not live"));
                return;
            }

            var view = await provider.GetRequiredService<LiveService>().PlayerViewOfAsync(Guid.Parse(MatchId), userId);
            await PushAsync(Protocol.View(view));
        }

        var stop = Subscribe(userId.ToString(), SendAsync, "player");

        // Session guard: drop the connection when the session is revoked.
        _ = Task.Run(async () =>
        {
            while (!hubContext.ConnectionAborted.IsCancellationRequested)
            {
                try
                {
                    await Task.Delay(TimeSpan.FromSeconds(30), hubContext.ConnectionAborted);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                using var scope = scopes.CreateScope();
                var scopedReader = scope.ServiceProvider.GetRequiredService<LiveReader>();
                if (!await scopedReader.IsSessionActiveAsync(userId, tokenVersion))
                {
                    try
                    {
                        await PushAsync(Protocol.Error("SESSION_ENDED", "session ended"));
                    }
                    catch { /* connection gone */ }
                    stop();
                    hubContext.Abort();
                    break;
                }
            }
        });

        try
        {
            await SendAsync();
        }
        catch
        {
            stop();
            Context.Abort();
        }

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        // The unsubscribe closure is registered against the registry; SignalR
        // disconnects fire after the connection is unusable, so push is a no-op.
        await base.OnDisconnectedAsync(exception);
    }

    // ---- client → server --------------------------------------------------------

    public async Task Answer(JsonElement message)
        => await HandleClientMessageAsync(message);

    public async Task Keyword(JsonElement message)
        => await HandleClientMessageAsync(message);

    public async Task Buzz(JsonElement message)
        => await HandleClientMessageAsync(message);

    private async Task HandleClientMessageAsync(JsonElement message)
    {
        var parsed = Protocol.ParseClientMessage(message);
        if (parsed is null)
        {
            await PushAsync(Protocol.Error("BAD_MESSAGE", "unknown or malformed message"));
            return;
        }

        var (type, requestId, data) = parsed.Value;
        var http = Context.GetHttpContext()!;
        var user = await http.RequireAuthAsync(Surface.GAMEPLAY);

        try
        {
            switch (type)
            {
                case "answer":
                {
                    if (!data.TryGetProperty("questionId", out var qid)
                        || !data.TryGetProperty("value", out var value))
                        throw new SubmitError(400, "BAD_MESSAGE", "unknown or malformed message");
                    var result = await submit.SubmitAnswerAsync(new SubmitService.SubmitContext(
                        Guid.Parse(MatchId), user.Id, Guid.Parse(qid.GetString()!), value.Clone(),
                        http.Connection.RemoteIpAddress?.ToString(),
                        http.Request.Headers.UserAgent.ToString()));
                    await PushAsync(Protocol.Ack("answer", result, requestId));
                    break;
                }
                case "keyword":
                {
                    if (!data.TryGetProperty("questionId", out var qid)
                        || !data.TryGetProperty("value", out var value))
                        throw new SubmitError(400, "BAD_MESSAGE", "unknown or malformed message");
                    var result = await submit.SubmitKeywordAsync(new SubmitService.SubmitContext(
                        Guid.Parse(MatchId), user.Id, Guid.Parse(qid.GetString()!), value.Clone(),
                        http.Connection.RemoteIpAddress?.ToString(),
                        http.Request.Headers.UserAgent.ToString()));
                    await PushAsync(Protocol.Ack("keyword", result, requestId));
                    break;
                }
                case "buzz":
                {
                    var result = await submit.SubmitVeDichCommandAsync(
                        Guid.Parse(MatchId), user.Id, "buzz");
                    await PushAsync(Protocol.Ack("buzz", result, requestId));
                    break;
                }
            }
        }
        catch (SubmitError error)
        {
            await PushAsync(Protocol.Error(error.Code, error.Message, requestId));
        }
        catch (Domain.Engine.VeDichRuleError error)
        {
            await PushAsync(Protocol.Error(error.Code, error.Message, requestId));
        }
        catch (ApiException error)
        {
            await PushAsync(Protocol.Error(error.Error, error.Message, requestId));
        }
        catch (Exception)
        {
            await PushAsync(Protocol.Error("INTERNAL", "something went wrong", requestId));
        }
    }
}

/// <summary>/portal/tournaments/:tournamentId/matches/:matchId/live/stream — console.</summary>
public sealed class ConsoleLiveHub(
    MatchHubRegistry registry,
    IHubContext<ConsoleLiveHub> self,
    IServiceScopeFactory scopes)
    : LiveHubBase(registry)
{
    public override async Task OnConnectedAsync()
    {
        var http = Context.GetHttpContext()!;
        // Context is nulled on release, but the session guard below outlives it.
        var hubContext = Context;
        ArmSelf(self.Clients.Client(Context.ConnectionId));
        try
        {
            await ResolveMatchIdAsync();
        }
        catch (ApiException ex)
        {
            await Clients.Caller.SendAsync("message", Protocol.Error(ex.Error, ex.Message));
            Context.Abort();
            return;
        }

        UserEntity user;
        try
        {
            user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
        }
        catch (ApiException ex)
        {
            await Clients.Caller.SendAsync("message", Protocol.Error(ex.Error, ex.Message));
            Context.Abort();
            return;
        }

        async Task SendAsync()
        {
            // Registry pushes fire long after this connection's scope was disposed,
            // so read the state through a scope of our own.
            using var scope = scopes.CreateScope();
            var payload = await scope.ServiceProvider.GetRequiredService<LiveService>()
                .ConsoleViewOfAsync(Guid.Parse(MatchId));
            if (payload is null)
            {
                await PushAsync(Protocol.Error("UNAVAILABLE", "no live round"));
                return;
            }
            await PushAsync(Protocol.Console(payload));
        }

        var stop = Subscribe("__console__", SendAsync, "console");

        var userId = user.Id;
        var tokenVersion = user.TokenVersion;
        _ = Task.Run(async () =>
        {
            while (!hubContext.ConnectionAborted.IsCancellationRequested)
            {
                try
                {
                    await Task.Delay(TimeSpan.FromSeconds(30), hubContext.ConnectionAborted);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                using var scope = scopes.CreateScope();
                var scopedReader = scope.ServiceProvider.GetRequiredService<LiveReader>();
                if (!await scopedReader.IsSessionActiveAsync(userId, tokenVersion))
                {
                    try
                    {
                        await PushAsync(Protocol.Error("SESSION_ENDED", "session ended"));
                    }
                    catch { /* connection gone */ }
                    stop();
                    hubContext.Abort();
                    break;
                }
            }
        });

        try
        {
            await SendAsync();
        }
        catch
        {
            stop();
            Context.Abort();
        }

        await base.OnConnectedAsync();
    }
}

/// <summary>/spectate/tournaments/:tournamentId/matches/:matchId/live/stream — audience.</summary>
public sealed class SpectateLiveHub(
    MatchHubRegistry registry,
    IHubContext<SpectateLiveHub> self,
    IServiceScopeFactory scopes)
    : LiveHubBase(registry)
{
    public override async Task OnConnectedAsync()
    {
        var http = Context.GetHttpContext()!;
        ArmSelf(self.Clients.Client(Context.ConnectionId));
        try
        {
            await ResolveMatchIdAsync();
        }
        catch (ApiException ex)
        {
            await Clients.Caller.SendAsync("message", Protocol.Error(ex.Error, ex.Message));
            Context.Abort();
            return;
        }

        async Task SendAsync()
        {
            // Registry pushes fire long after this connection's scope was disposed,
            // so read the state through a scope of our own.
            using var scope = scopes.CreateScope();
            var payload = await scope.ServiceProvider.GetRequiredService<LiveService>()
                .AudienceViewOfAsync(Guid.Parse(MatchId));
            if (payload is null)
            {
                await PushAsync(Protocol.Error("UNAVAILABLE", "no live round"));
                return;
            }
            await PushAsync(Protocol.Console(payload));
        }

        var stop = Subscribe("__console__", SendAsync, "spectate");
        try
        {
            await SendAsync();
        }
        catch
        {
            stop();
            Context.Abort();
        }

        await base.OnConnectedAsync();
    }
}
