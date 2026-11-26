using AOC.Api.Http;
using AOC.Infrastructure.Configuration;

namespace AOC.Api.Modules.Audit;

public static class AuditRoutes
{
    public static IEndpointRouteBuilder MapAuditRoutes(this IEndpointRouteBuilder app)
    {
        app.MapGet("/portal/audit-events", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN");
            var query = Validate.Query(http);
            var service = http.RequestServices.GetRequiredService<AuditEventsService>();
            var page = await service.ListAsync(AuditQuery.From(query), Pagination.ParsePage(query));
            return Results.Json(page, JsonApi.Options);
        });

        app.MapGet("/portal/audit-events/actions", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN");
            var service = http.RequestServices.GetRequiredService<AuditEventsService>();
            return Results.Json(await service.ActionsAsync(), JsonApi.Options);
        });

        return app;
    }
}
