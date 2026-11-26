using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Routing;
using AOC.Api.Modules.Questions;
using Xunit;

namespace AOC.Tests.Modules;

public class QuestionRouteLimitTests
{
    private static RouteEndpoint EndpointOf(WebApplication app, string pattern)
        => ((IEndpointRouteBuilder)app).DataSources
            .SelectMany(source => source.Endpoints)
            .OfType<RouteEndpoint>()
            .Single(endpoint => endpoint.RoutePattern.RawText == pattern);

    private static string? PolicyOf(WebApplication app, string pattern)
        => EndpointOf(app, pattern).Metadata
            .GetMetadata<EnableRateLimitingAttribute>()?.PolicyName;

    [Fact]
    public void Duplicating_a_question_is_rate_limited()
    {
        var app = WebApplication.CreateBuilder().Build();
        app.MapQuestionRoutes();

        Assert.Equal("strict10", PolicyOf(app, "/portal/questions/{questionId}/duplicate"));
    }

    [Fact]
    public void Reading_a_question_is_not_rate_limited()
    {
        var app = WebApplication.CreateBuilder().Build();
        app.MapQuestionRoutes();

        Assert.Null(PolicyOf(app, "/portal/questions/{questionId}/usage"));
    }
}
