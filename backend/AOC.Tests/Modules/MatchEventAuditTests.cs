using AOC.Api.Modules.Live;
using AOC.Domain.Contracts;
using Xunit;

namespace AOC.Tests.Modules;

public class MatchEventAuditTests
{
    private static readonly Guid QuestionA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid QuestionB = Guid.Parse("22222222-2222-2222-2222-222222222222");

    private static (Guid QuestionId, System.Text.Json.JsonElement Payload) Logged(
        Guid questionId, PowerKind power, string? targetId = null)
    {
        var fact = Facts.Power(questionId.ToString(), "u1", "ve-dich", power, targetId);
        return (questionId, fact.Payload);
    }

    [Fact]
    public void Same_power_on_a_later_question_is_not_a_duplicate()
    {
        // Powers re-arm every turn: STAR used again on another question must still
        // reach the audit log.
        var logged = new[] { Logged(QuestionA, PowerKind.STAR) };

        Assert.False(MatchEventAudit.PowerLogged(logged, QuestionB, "STAR"));
    }

    [Fact]
    public void Replaying_the_same_question_power_is_a_duplicate()
    {
        var logged = new[] { Logged(QuestionA, PowerKind.STAR) };

        Assert.True(MatchEventAudit.PowerLogged(logged, QuestionA, "STAR"));
    }

    [Fact]
    public void Different_power_on_the_same_question_is_not_a_duplicate()
    {
        var logged = new[] { Logged(QuestionA, PowerKind.STAR) };

        Assert.False(MatchEventAudit.PowerLogged(logged, QuestionA, "ASSIGN"));
    }
}
