using System.Text.Json;
using AOC.Domain.Contracts;

namespace AOC.Api.Modules.Live;

public static class Facts
{
    public static AnswerFact Oral(string questionId, string userId, Verdict verdict, int points) =>
        new(questionId, userId, JsonSerializer.SerializeToElement(new { oral = true }, JsonApiOptions.Options),
            verdict, points);

    public static DraftFact Draft(string questionId, string userId, string text)
    {
        var value = JsonSerializer.SerializeToElement(new { text }, JsonApiOptions.Options);
        return new DraftFact(questionId, userId, value);
    }

    public static EventFact Pick(string questionId, string userId, string roundId, string turnId, int pickOrder)
    {
        var payload = JsonSerializer.SerializeToElement(
            new { kind = "PICK", turnId, pickOrder }, JsonApiOptions.Options);
        return new EventFact(questionId, userId, roundId, MatchEventKind.PICK, payload);
    }

    public static EventFact Buzz(string questionId, string userId, string roundId, int buzzMs)
    {
        // "won" is the buzz race, not the answer: the fact is only emitted once the
        // engine accepted the press, so it always says the window was won. Whether
        // the player then answered correctly is carried by the answer verdict.
        var payload = JsonSerializer.SerializeToElement(
            new { kind = "BUZZ", buzzMs, won = true }, JsonApiOptions.Options);
        return new EventFact(questionId, userId, roundId, MatchEventKind.BUZZ, payload);
    }

    public static EventFact Power(string questionId, string userId, string roundId, PowerKind power, string? targetId)
    {
        JsonElement payload;
        if (targetId is null)
        {
            payload = JsonSerializer.SerializeToElement(
                new { kind = "POWER", power }, JsonApiOptions.Options);
        }
        else
        {
            payload = JsonSerializer.SerializeToElement(
                new { kind = "POWER", power, targetId }, JsonApiOptions.Options);
        }
        return new EventFact(questionId, userId, roundId, MatchEventKind.POWER, payload);
    }
}
