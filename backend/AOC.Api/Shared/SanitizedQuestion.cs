using AOC.Domain.Contracts;

namespace AOC.Api.Shared;

public sealed record SanitizedQuestion(
    string QuestionId,
    QuestionKind Kind,
    int Position,
    string QuestionText,
    Media? Media,
    SanitizedPayload Payload
);
