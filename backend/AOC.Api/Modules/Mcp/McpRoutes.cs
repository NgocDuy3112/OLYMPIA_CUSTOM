using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.RateLimiting;
using ModelContextProtocol.Server;
using AOC.Api.Http;
using AOC.Api.Modules.McpKeys;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Configuration;

namespace AOC.Api.Modules.Mcp;

public static class McpRoutes
{
    public static IEndpointRouteBuilder MapMcpRoutes(this IEndpointRouteBuilder app)
    {
        // Endpoint filter: Bearer token → verify → role check → actor into Items.
        app.MapMcp("/mcp").AddEndpointFilter(async (context, next) =>
        {
            var http = context.HttpContext;
            var header = http.Request.Headers.Authorization.ToString();
            var token = header.StartsWith("Bearer ") ? header["Bearer ".Length..] : "";
            if (token.Length == 0)
            {
                http.Response.StatusCode = 401;
                await http.Response.WriteAsJsonAsync(new
                {
                    error = "UNAUTHORIZED",
                    message = "Missing bearer token"
                }, JsonApi.Options);
                return null;
            }

            var keys = http.RequestServices.GetRequiredService<McpKeysService>();
            McpKeysService.VerifiedMcpKey verified;
            try
            {
                verified = await keys.VerifyMcpTokenAsync(token,
                    http.Connection.RemoteIpAddress?.ToString(),
                    http.Request.Headers.UserAgent.ToString());
            }
            catch (McpKeyError error)
            {
                http.Response.StatusCode = 401;
                await http.Response.WriteAsJsonAsync(new
                {
                    error = "UNAUTHORIZED",
                    message = error.Message
                }, JsonApi.Options);
                return null;
            }

            if (verified.User.Role is not (UserRole.ADMIN or UserRole.OPERATOR))
            {
                http.Response.StatusCode = 403;
                await http.Response.WriteAsJsonAsync(new
                {
                    error = "FORBIDDEN",
                    message = "Insufficient role"
                }, JsonApi.Options);
                return null;
            }

            http.Items[McpActorAccessor.ItemKey] = new McpActor(
                verified.Key.Id,
                verified.Key.Scopes.ToList(),
                verified.User.Id,
                verified.User.Role.ToString());

            var claims = new List<Claim>
            {
                new("keyId", verified.Key.Id.ToString()),
                new("userId", verified.User.Id.ToString()),
                new("role", verified.User.Role.ToString()),
                new("scopes", string.Join(",", verified.Key.Scopes))
            };
            http.User = new ClaimsPrincipal(new ClaimsIdentity(claims, authenticationType: "mcp-key"));

            return await next(context);
        });

        return app;
    }
}
