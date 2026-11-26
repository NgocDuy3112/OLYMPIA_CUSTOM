using AOC.Domain.Contracts;
using AOC.Infrastructure.Data;
using AOC.Tests.Auth;
using Xunit;

namespace AOC.Tests.Modules;

public class McpToolIdentityTests
{
    [DbFact]
    public async Task An_operator_key_reads_a_question_of_its_own_private_tournament()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var harness = McpToolHarness.Open();
        var ownerId = await harness.SeedUserAsync(UserRole.OPERATOR);
        var tournamentId = await harness.SeedTournamentAsync(ownerId, Visibility.PRIVATE);
        var questionId = await harness.SeedQuestionAsync(ownerId);

        var result = await harness.As(ownerId, "READ")
            .GetQuestion(questionId.ToString(), tournamentId.ToString());

        Assert.True(result.IsError is not true);
        Assert.Equal(questionId, McpToolHarness.Payload(result).GetProperty("id").GetGuid());
    }

    [DbFact]
    public async Task An_operator_key_cannot_read_a_private_tournament_of_another_owner()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var harness = McpToolHarness.Open();
        var ownerId = await harness.SeedUserAsync(UserRole.OPERATOR);
        var strangerId = await harness.SeedUserAsync(UserRole.OPERATOR);
        var tournamentId = await harness.SeedTournamentAsync(ownerId, Visibility.PRIVATE);
        var questionId = await harness.SeedQuestionAsync(ownerId);

        var result = await harness.As(strangerId, "READ")
            .GetQuestion(questionId.ToString(), tournamentId.ToString());

        Assert.Equal("NOT_FOUND", McpToolHarness.ErrorCode(result));
    }

    [DbFact]
    public async Task A_public_tournament_stays_readable_for_another_operator()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var harness = McpToolHarness.Open();
        var ownerId = await harness.SeedUserAsync(UserRole.OPERATOR);
        var readerId = await harness.SeedUserAsync(UserRole.OPERATOR);
        var tournamentId = await harness.SeedTournamentAsync(ownerId, Visibility.PUBLIC);
        var questionId = await harness.SeedQuestionAsync(ownerId);

        var tools = harness.As(readerId, "READ");
        var listed = await tools.ListQuestions(tournamentId.ToString());
        var eligible = await tools.EligibleQuestions(tournamentId.ToString());

        Assert.True(listed.IsError is not true);
        Assert.True(eligible.IsError is not true);
        Assert.Contains(McpToolHarness.Payload(listed).GetProperty("items").EnumerateArray(),
            item => item.GetProperty("id").GetGuid() == questionId);
        Assert.Contains(McpToolHarness.Payload(eligible).GetProperty("items").EnumerateArray(),
            item => item.GetProperty("id").GetGuid() == questionId);
    }

    [DbFact]
    public async Task An_admin_key_reads_a_private_tournament_of_another_owner()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var harness = McpToolHarness.Open();
        var ownerId = await harness.SeedUserAsync(UserRole.OPERATOR);
        var adminId = await harness.SeedUserAsync(UserRole.ADMIN);
        var tournamentId = await harness.SeedTournamentAsync(ownerId, Visibility.PRIVATE);
        var questionId = await harness.SeedQuestionAsync(ownerId);

        var result = await harness.As(adminId, "READ")
            .GetQuestion(questionId.ToString(), tournamentId.ToString());

        Assert.True(result.IsError is not true);
        Assert.Equal(questionId, McpToolHarness.Payload(result).GetProperty("id").GetGuid());
    }
}
