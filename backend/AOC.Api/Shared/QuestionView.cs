using AOC.Domain.Contracts;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Shared;

public static class QuestionView
{
    public static SanitizedQuestion Sanitize(MatchQuestion question)
        => Sanitize(question.Id, question.Kind, question.Position, question.QuestionText,
            question.Media, question.Payload);

    public static SanitizedQuestion Sanitize(QuestionBankEntity question)
        => Sanitize(question.Id.ToString(), question.Kind, 0, question.QuestionText,
            question.MediaValue, question.PayloadValue);

    private static SanitizedQuestion Sanitize(
        string id, QuestionKind kind, int position, string text, Media? media, QuestionPayload payload)
    {
        SanitizedPayload face = new();
        if (payload is QuestionPayload.Choice choice && choice.Options.Count > 0)
            face = new SanitizedPayload(Options: choice.Options);

        if (kind == QuestionKind.KEYWORD && payload is QuestionPayload.Keyword keyword)
            return new SanitizedQuestion(
                id, kind, position, text, media,
                new SanitizedPayload(CodeLength: keyword.Code.Length));

        return new SanitizedQuestion(id, kind, position, text, media, face);
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
