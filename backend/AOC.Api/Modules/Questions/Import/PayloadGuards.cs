using System.Text.Json;
using AOC.Domain.Contracts;

namespace AOC.Api.Modules.Questions;

public static class PayloadGuards
{
    public static void AssertPayloadForKind(QuestionKind kind, JsonElement payload)
    {
        var p = payload.ValueKind == JsonValueKind.Object
            ? payload
            : JsonSerializer.SerializeToElement(new { });

        switch (kind)
        {
            case QuestionKind.CHOICE:
            {
                if (!p.TryGetProperty("options", out var options) || options.ValueKind != JsonValueKind.Array
                    || !p.TryGetProperty("correctSet", out var correctSet) || correctSet.ValueKind != JsonValueKind.Array)
                    throw Fail("console questions require payload.options and payload.correctSet");

                var optionList = options.EnumerateArray().ToList();
                if (optionList.Count == 0)
                    throw Fail("console questions require at least one option");
                var correctList = correctSet.EnumerateArray().ToList();
                if (correctList.Count == 0)
                    throw Fail("console questions require a non-empty correctSet");

                var ids = optionList
                    .Select(o => o.TryGetProperty("id", out var id) ? id.GetString() ?? "" : "")
                    .ToList();
                if (ids.Distinct().Count() != ids.Count)
                    throw Fail("console option ids must be unique");

                var unknown = correctList
                    .Select(c => c.ToString())
                    .Where(id => !ids.Contains(id))
                    .ToList();
                if (unknown.Count > 0)
                    throw Fail("correctSet must reference existing option ids",
                        unknown.Select(id => $"unknown option id \"{id}\"").ToList());
                return;
            }
            case QuestionKind.TEXT:
            {
                if (!p.TryGetProperty("acceptedAnswers", out var accepted) || accepted.ValueKind != JsonValueKind.Array)
                    throw Fail("TEXT questions require payload.acceptedAnswers");
                if (accepted.GetArrayLength() == 0)
                    throw Fail("TEXT questions require at least one accepted answer");
                return;
            }
            default:
            {
                if (!p.TryGetProperty("code", out var code) || code.ValueKind != JsonValueKind.String
                    || code.GetString()!.Length == 0)
                    throw Fail("KEYWORD questions require a non-empty payload.code");
                return;
            }
        }
    }

    private static QuestionError Fail(string message, List<string>? details = null)
        => new(QuestionErrorCode.VALIDATION, message, details ?? []);
}
