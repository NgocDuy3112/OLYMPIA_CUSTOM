using System.Text.Json;
using AOC.Domain.Contracts;

namespace AOC.Api.Shared;

public sealed record SanitizedQuestion(
    string QuestionId,
    QuestionKind Kind,
    int Position,
    string QuestionText,
    Media? Media,
    int? TimeLimit,
    SanitizedPayload Payload
);

public sealed record SanitizedPayload(
    List<ChoiceOption>? Options = null,
    int? CodeLength = null
);

public static class QuestionView
{
    public static SanitizedQuestion Sanitize(MatchQuestion question)
    {
        var payload = question.Payload;

        SanitizedPayload face = new();
        if (payload is QuestionPayload.Choice choice && choice.Options.Count > 0)
        {
            face = new SanitizedPayload(Options: choice.Options);
        }

        if (question.Kind == QuestionKind.KEYWORD && payload is QuestionPayload.Keyword keyword)
        {
            return new SanitizedQuestion(
                question.Id, question.Kind, question.Position, question.QuestionText,
                question.Media, question.TimeLimit,
                new SanitizedPayload(CodeLength: keyword.Code.Length));
        }

        return new SanitizedQuestion(
            question.Id, question.Kind, question.Position, question.QuestionText,
            question.Media, question.TimeLimit, face);
    }

    public static string? AnswerRowDisplay(AnswerValue value, MatchQuestion? question)
    {
        switch (value)
        {
            case AnswerValue.Text text:
                if (string.IsNullOrWhiteSpace(text.Value)) return null;
                return text.Value;
            case AnswerValue.Picked picked:
                if (picked.Items.Count == 0) return null;
                if (question?.Payload is QuestionPayload.Choice choice)
                {
                    var texts = choice.Options
                        .Where(o => picked.Items.Contains(o.Id))
                        .Select(o => o.Text)
                        .ToList();
                    if (texts.Count > 0) return string.Join(", ", texts);
                }
                return string.Join(", ", picked.Items);
            default:
                return null;
        }
    }
}
