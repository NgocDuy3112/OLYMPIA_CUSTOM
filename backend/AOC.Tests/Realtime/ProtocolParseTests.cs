using System.Text.Json;
using AOC.Api.Modules.Live;
using Xunit;

namespace AOC.Tests.Realtime;

public class ProtocolParseTests
{
    private const string QuestionId = "6f1a5f2e-1d3b-4c66-8a0e-2b1c9d4f5a60";

    private static JsonElement Frame(string type, object data)
        => JsonDocument.Parse(JsonSerializer.Serialize(new
        {
            v = Protocol.Version,
            type,
            requestId = "r-1",
            data
        })).RootElement;

    [Fact]
    public void An_answer_frame_parses_its_question_id()
    {
        var parsed = Protocol.ParseClientMessage(Frame("answer",
            new { questionId = QuestionId, value = new { kind = "text", value = "Hà Nội" } }));

        Assert.NotNull(parsed);
        Assert.Equal("answer", parsed.Type);
        Assert.Equal("r-1", parsed.RequestId);
        Assert.Equal(Guid.Parse(QuestionId), parsed.QuestionId);
    }

    [Fact]
    public void A_question_id_that_is_not_a_uuid_is_rejected()
    {
        var parsed = Protocol.ParseClientMessage(Frame("answer",
            new { questionId = "not-a-uuid", value = new { kind = "text", value = "Hà Nội" } }));

        Assert.Null(parsed);
    }

    [Fact]
    public void A_missing_question_id_is_rejected_for_answer_and_keyword()
    {
        var value = new { kind = "text", value = "Hà Nội" };

        Assert.Null(Protocol.ParseClientMessage(Frame("answer", new { value })));
        Assert.Null(Protocol.ParseClientMessage(Frame("keyword", new { value })));
    }

    [Fact]
    public void A_buzz_frame_parses_without_a_question_id()
    {
        var parsed = Protocol.ParseClientMessage(Frame("buzz",
            new { pressedAt = "2026-01-01T00:00:00.000Z" }));

        Assert.NotNull(parsed);
        Assert.Equal("buzz", parsed.Type);
        Assert.Null(parsed.QuestionId);
    }

    [Fact]
    public void A_buzz_frame_with_a_malformed_question_id_is_rejected()
    {
        Assert.Null(Protocol.ParseClientMessage(Frame("buzz", new { questionId = "123" })));
    }

    [Fact]
    public void An_unknown_type_is_rejected()
    {
        Assert.Null(Protocol.ParseClientMessage(Frame("judge", new { questionId = QuestionId })));
    }
}
