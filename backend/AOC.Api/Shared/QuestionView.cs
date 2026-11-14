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

/// <summary>Port of lib/question-view.ts — what players/audience may see.</summary>
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

    public static string? AnswerDisplay(MatchQuestion question)
    {
        var payload = question.Payload;
        switch (question.Kind)
        {
            case QuestionKind.CHOICE:
            {
                if (payload is not QuestionPayload.Choice choice) return null;
                var correct = choice.CorrectSet.ToHashSet();
                var texts = choice.Options.Where(o => correct.Contains(o.Id)).Select(o => o.Text).ToList();
                return texts.Count > 0 ? string.Join(", ", texts) : null;
            }
            case QuestionKind.TEXT:
            case QuestionKind.HINT:
            {
                if (payload is not QuestionPayload.Text text) return null;
                return text.AcceptedAnswers.Count > 0 ? string.Join(" / ", text.AcceptedAnswers) : null;
            }
            default:
                return payload is QuestionPayload.Keyword kw && kw.Code.Length > 0 ? kw.Code : null;
        }
    }
}
