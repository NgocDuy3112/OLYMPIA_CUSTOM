using System.Text.Json;
using Microsoft.AspNetCore.Diagnostics;
using AOC.Api.Modules.Matches;
using AOC.Api.Modules.Questions;
using AOC.Api.Modules.Tournaments;
using AOC.Api.Modules.Live;
using AOC.Api.Modules.MatchCodes;
using AOC.Api.Modules.McpKeys;
using AOC.Api.Modules.Recording;
using AOC.Domain.Engine;
using AOC.Infrastructure.Data;

namespace AOC.Api.Http;

public sealed class ErrorHandlingMiddleware(RequestDelegate next, ILogger<ErrorHandlingMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (Exception ex) when (!context.Response.HasStarted)
        {
            var (status, body) = Map(ex);
            if (status >= 500)
                logger.LogError(ex, "request failed: {Method} {Path}", context.Request.Method, context.Request.Path);

            context.Response.StatusCode = status;
            context.Response.ContentType = "application/json; charset=utf-8";
            await context.Response.WriteAsync(JsonSerializer.Serialize(body, JsonDefaults.Options));
        }
    }

    private static (int Status, object Body) Map(Exception ex) => ex switch
    {
        ApiException api => (api.Status, FastifyBody(api.Status, api.Error, api.Message)),

        MatchError match => (match.Status, Body(match.Code.ToString(), match.Message, match.Details)),

        TournamentError tournament => (tournament.Status, Body(tournament.Code.ToString(), tournament.Message, tournament.Details)),

        QuestionError question => (question.Status, Body(question.Code.ToString(), question.Message, question.Details)),

        CodeError code => (code.Status, Body(code.Code.ToString(), code.Message, code.Details)),

        McpKeyError mcpKey => (mcpKey.Status, Body(mcpKey.Code.ToString(), mcpKey.Message, mcpKey.Details)),

        RecordingError recording => (recording.StatusCode, Body("RECORDING", recording.Message, null)),

        StaleRevisionError stale => (409, Body("CONFLICT", stale.Message,
            new Dictionary<string, object?> { ["currentRevision"] = stale.CurrentRevision })),

        LiveConflictError conflict => (409, Body("CONFLICT", conflict.Message,
            new Dictionary<string, object?>
            {
                ["expectedVersion"] = conflict.ExpectedVersion,
                ["currentVersion"] = conflict.CurrentVersion
            })),

        SubmitError submit => (submit.Status, Body(submit.Code, submit.Message, null)),

        RuleError rule => (409, Body(rule.Code, rule.Message, null)),

        VeDichRuleError veDich => (409, Body(veDich.Code, veDich.Message, null)),

        LiveStateError state => (500, Body("STATE_INVALID", state.Message,
            new Dictionary<string, object?> { ["details"] = state.Details })),

        LiveNotFoundError notFound => (404, Body("NOT_FOUND", notFound.Message, null)),

        PaginationError pagination => (400, Body("VALIDATION", pagination.Message, null)),

        BadHttpRequestException badRequest => (badRequest.StatusCode,
            FastifyBody(badRequest.StatusCode, "Bad Request", badRequest.Message)),

        _ => (500, FastifyBody(500, "Internal Server Error", ex.Message))
    };

    private static object FastifyBody(int status, string error, string message) =>
        new Dictionary<string, object?>
        {
            ["statusCode"] = status,
            ["error"] = error,
            ["message"] = message
        };

    private static object Body(string error, string message, object? details)
    {
        if (details is null || details is false)
        {
            return new Dictionary<string, object?>
            {
                ["error"] = error,
                ["message"] = message
            };
        }
        if (details is Dictionary<string, object?> dict)
        {
            return new Dictionary<string, object?>(dict)
            {
                ["error"] = error,
                ["message"] = message
            };
        }
        return new Dictionary<string, object?>
        {
            ["error"] = error,
            ["message"] = message,
            ["details"] = details
        };
    }
}
