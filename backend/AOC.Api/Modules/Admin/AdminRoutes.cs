using AOC.Api.Http;
using AOC.Infrastructure.Configuration;

namespace AOC.Api.Modules.Admin;

public static class AdminRoutes
{
    public static IEndpointRouteBuilder MapAdminRoutes(this IEndpointRouteBuilder app)
    {
        app.MapGet("/portal/operators", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN");
            var service = http.RequestServices.GetRequiredService<AdminService>();
            var items = await service.ListOperatorsAsync();
            return Results.Json(new { items }, JsonApi.Options);
        });

        app.MapPatch("/portal/operators/{userId}/status", (Delegate)SetOperatorStatusAsync);

        app.MapPatch("/portal/players/{userId}/status", (Delegate)SetPlayerStatusAsync);

        app.MapPost("/portal/operators", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN");
            var body = await Validate.ReadJsonBodyAsync(http);
            var service = http.RequestServices.GetRequiredService<AdminService>();
            var created = await service.CreateOperatorAsync(body);
            http.Response.StatusCode = 201;
            return Results.Json(created, JsonApi.Options);
        }).RequireRateLimiting("strict10");

        app.MapPost("/portal/invites/accept", async (HttpContext http) =>
        {
            var body = await Validate.ReadJsonBodyAsync(http);
            var service = http.RequestServices.GetRequiredService<AdminService>();
            var accepted = await service.AcceptInviteAsync(body);
            return Results.Json(accepted, JsonApi.Options);
        }).RequireRateLimiting("strict10").DisableAntiforgery();

        return app;
    }

    private static Task<IResult> SetOperatorStatusAsync(HttpContext http)
        => SetAccountStatusAsync(http, (service, userId, disabled) =>
            service.SetOperatorStatusAsync(userId, disabled));

    private static Task<IResult> SetPlayerStatusAsync(HttpContext http)
        => SetAccountStatusAsync(http, (service, userId, disabled) =>
            service.SetPlayerStatusAsync(userId, disabled));

    private static async Task<IResult> SetAccountStatusAsync(HttpContext http,
        Func<AccountStatusService, Guid, bool, Task<AccountStatusService.PublicAccountStatus>> setStatus)
    {
        var actor = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN");
        var userId = Guid.Parse(Validate.RouteUuid(http, "userId"));
        var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));
        var disabled = Validate.RequiredBool(body, "disabled");

        var service = http.RequestServices.GetRequiredService<AccountStatusService>();
        var account = await setStatus(service, userId, disabled);

        var audit = http.RequestServices.GetRequiredService<AOC.Infrastructure.Audit.AuditService>();
        await audit.AuditAsync(new AOC.Infrastructure.Audit.AuditEvent
        {
            Action = disabled ? "account_disabled" : "account_enabled",
            ActorId = actor.Id,
            TargetId = account.UserId,
            Ip = http.Connection.RemoteIpAddress?.ToString(),
            UserAgent = http.Request.Headers.UserAgent.ToString(),
            Details = new AccountStatusAudit(
                account.UserId, account.Username, account.Role.ToString(), account.DisabledAt)
        });

        return Results.Json(account, JsonApi.Options);
    }

    private sealed record AccountStatusAudit(
        Guid UserId, string Username, string Role, DateTime? DisabledAt);
}
