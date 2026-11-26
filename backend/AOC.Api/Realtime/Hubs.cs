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

using AOC.Domain.Contracts;
namespace AOC.Api.Realtime;

public abstract class LiveHubBase(MatchHubRegistry registry) : Hub
{
    protected string MatchId = "";

    private Action? stopSubscription;

    protected IClientProxy? Self { get; private set; }

    protected void ArmSelf(IClientProxy self) => Self = self;

    protected static string ParseMatchId(HttpContext http)
    {
        var segments = http.Request.Path.Value?.Split('/', StringSplitOptions.RemoveEmptyEntries) ?? [];
        for (var i = 0; i < segments.Length - 1; i++)
            if (segments[i] == "matches")
            {
                if (!Guid.TryParse(segments[i + 1], out _))
                    throw new ApiException(400, "Bad Request", "match id in the hub path is not a uuid");
                return segments[i + 1];
            }
        throw new ApiException(400, "Bad Request", "match id missing from hub path");
    }

    protected static string ParseTournamentIdFromPath(HttpContext http)
    {
        var segments = http.Request.Path.Value?.Split('/', StringSplitOptions.RemoveEmptyEntries) ?? [];
        for (var i = 0; i < segments.Length - 1; i++)
            if (segments[i] == "tournaments")
                return segments[i + 1];
        throw new ApiException(400, "Bad Request", "tournament id missing from hub path");
    }

    protected void HoldSubscription(Action unsubscribe) => stopSubscription = unsubscribe;

    protected void ReleaseSubscription()
    {
        stopSubscription?.Invoke();
        stopSubscription = null;
    }

    protected void ArmSessionMonitor(
        Guid userId, int tokenVersion, IServiceScopeFactory scopes, ILogger logger, Action stop)
    {
        var connection = Context;
        _ = Task.Run(async () =>
        {
            while (!connection.ConnectionAborted.IsCancellationRequested)
            {
                try
                {
                    await Task.Delay(TimeSpan.FromSeconds(30), connection.ConnectionAborted);
                }
                catch (OperationCanceledException)
                {
                    break;
                }

                try
                {
                    using var scope = scopes.CreateScope();
                    var reader = scope.ServiceProvider.GetRequiredService<LiveReader>();
                    if (await reader.IsSessionActiveAsync(userId, tokenVersion)) continue;
                    await PushAsync(Protocol.Error("SESSION_ENDED", "session ended"));
                    stop();
                    connection.Abort();
                    break;
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "session monitor check failed for match {MatchId}", MatchId);
                }
            }
        });
    }

    protected async Task<string> ResolveMatchIdAsync()
    {
        MatchId = ParseMatchId(Context.GetHttpContext()!);
        return MatchId;
    }

    protected Task PushAsync(Dictionary<string, object?> envelope)
        => PushAsync(envelope, CancellationToken.None);

    protected async Task PushAsync(Dictionary<string, object?> envelope, CancellationToken token)
        => await (Self ?? Clients.Caller).SendAsync("message", envelope, token);

    protected Action Subscribe(
        string userId, Func<PublishScope, CancellationToken, Task> push, string kind)
        => registry.Subscribe(MatchId, new HubSubscriber(userId, push, PushAsync, kind));
}

public sealed class PlayerLiveHub(
    MatchHubRegistry registry,
    SubmitService submit,
    SessionTokens tokens,
    IHubContext<PlayerLiveHub> self,
    IServiceScopeFactory scopes,
    ILogger<PlayerLiveHub> logger)
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
            await Clients.Caller.SendAsync("message",
                Protocol.Error("NOT_SEATED", "not a player in this match"));
            Context.Abort();
            return;
        }

        var userId = user.Id;
        var tokenVersion = user.TokenVersion;

        async Task SendAsync(PublishScope _, CancellationToken token)
        {
            using var scope = scopes.CreateScope();
            var provider = scope.ServiceProvider;
            var matchRow = await provider.GetRequiredService<MatchesService>().GetMatchByIdAsync(MatchId);
            var liveSnapshot = await provider.GetRequiredService<LiveReader>().ReadLiveAsync(Guid.Parse(MatchId));
            if (matchRow.Status != MatchStatus.LIVE || liveSnapshot is null)
            {
                await PushAsync(Protocol.Error("UNAVAILABLE", "the match is not live"), token);
                return;
            }

            var view = await provider.GetRequiredService<LiveService>().PlayerViewOfAsync(Guid.Parse(MatchId), userId);
            await PushAsync(Protocol.View(view), token);
        }

        var stop = Subscribe(userId.ToString(), SendAsync, "player");
        HoldSubscription(stop);

        ArmSessionMonitor(userId, tokenVersion, scopes, logger, stop);

        try
        {
            await SendAsync(new PublishScope(), CancellationToken.None);
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
        ReleaseSubscription();
        await base.OnDisconnectedAsync(exception);
    }


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

        var (type, requestId, data) = (parsed.Type, parsed.RequestId, parsed.Data);
        var http = Context.GetHttpContext()!;
        var user = await http.RequireAuthAsync(Surface.GAMEPLAY);

        try
        {
            switch (type)
            {
                case "answer":
                {
                    var questionId = parsed.QuestionId
                        ?? throw new SubmitError(400, "BAD_MESSAGE", "unknown or malformed message");
                    if (!data.TryGetProperty("value", out var value))
                        throw new SubmitError(400, "BAD_MESSAGE", "unknown or malformed message");
                    var result = await submit.SubmitAnswerAsync(new SubmitService.SubmitContext(
                        Guid.Parse(MatchId), user.Id, questionId, value.Clone(),
                        http.Connection.RemoteIpAddress?.ToString(),
                        http.Request.Headers.UserAgent.ToString(),
                        SubmitService.ReadPressedAt(data)));
                    await PushAsync(Protocol.Ack("answer", result, requestId));
                    break;
                }
                case "keyword":
                {
                    var questionId = parsed.QuestionId
                        ?? throw new SubmitError(400, "BAD_MESSAGE", "unknown or malformed message");
                    if (!data.TryGetProperty("value", out var value))
                        throw new SubmitError(400, "BAD_MESSAGE", "unknown or malformed message");
                    var result = await submit.SubmitKeywordAsync(new SubmitService.SubmitContext(
                        Guid.Parse(MatchId), user.Id, questionId, value.Clone(),
                        http.Connection.RemoteIpAddress?.ToString(),
                        http.Request.Headers.UserAgent.ToString(),
                        SubmitService.ReadPressedAt(data)));
                    await PushAsync(Protocol.Ack("keyword", result, requestId));
                    break;
                }
                case "buzz":
                {
                    var result = await submit.SubmitBuzzAsync(
                        Guid.Parse(MatchId), user.Id, SubmitService.ReadPressedAt(data));
                    await PushAsync(Protocol.Ack("buzz", result, requestId));
                    break;
                }
            }
        }
        catch (SubmitError error)
        {
            await PushAsync(Protocol.Error(error.Code, error.Message, requestId));
        }
        catch (VeDichRuleError error)
        {
            await PushAsync(Protocol.Error(error.Code, error.Message, requestId));
        }
        catch (RuleError error)
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

public sealed class ConsoleLiveHub(
    MatchHubRegistry registry,
    IHubContext<ConsoleLiveHub> self,
    IServiceScopeFactory scopes,
    ILogger<ConsoleLiveHub> logger)
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

        try
        {
            await LiveMatchGuard.RequirePortalWriteAsync(
                http, ParseTournamentIdFromPath(http), MatchId, user);
        }
        catch (ApiException ex)
        {
            await Clients.Caller.SendAsync("message", Protocol.Error(ex.Error, ex.Message));
            Context.Abort();
            return;
        }

        async Task SendAsync(PublishScope publish, CancellationToken token)
        {
            using var scope = scopes.CreateScope();
            var payload = await scope.ServiceProvider.GetRequiredService<LiveService>()
                .ConsoleViewOfAsync(Guid.Parse(MatchId), publish);
            if (payload is null)
            {
                await PushAsync(Protocol.Error("UNAVAILABLE", "no live round"), token);
                return;
            }
            await PushAsync(Protocol.Console(payload), token);
        }

        var stop = Subscribe("__console__", SendAsync, "console");
        HoldSubscription(stop);

        var userId = user.Id;
        var tokenVersion = user.TokenVersion;
        ArmSessionMonitor(userId, tokenVersion, scopes, logger, stop);

        try
        {
            await SendAsync(new PublishScope(), CancellationToken.None);
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
        ReleaseSubscription();
        await base.OnDisconnectedAsync(exception);
    }
}

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

        try
        {
            await LiveMatchGuard.RequireSpectatableAsync(
                http, ParseTournamentIdFromPath(http), MatchId);
        }
        catch (ApiException ex)
        {
            await Clients.Caller.SendAsync("message", Protocol.Error(ex.Error, ex.Message));
            Context.Abort();
            return;
        }

        async Task SendAsync(PublishScope publish, CancellationToken token)
        {
            using var scope = scopes.CreateScope();
            var payload = await scope.ServiceProvider.GetRequiredService<LiveService>()
                .AudienceViewOfAsync(Guid.Parse(MatchId), publish);
            if (payload is null)
            {
                await PushAsync(Protocol.Error("UNAVAILABLE", "no live round"), token);
                return;
            }
            await PushAsync(Protocol.Console(payload), token);
        }

        var stop = Subscribe("__console__", SendAsync, "spectate");
        HoldSubscription(stop);
        try
        {
            await SendAsync(new PublishScope(), CancellationToken.None);
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
        ReleaseSubscription();
        await base.OnDisconnectedAsync(exception);
    }
}
