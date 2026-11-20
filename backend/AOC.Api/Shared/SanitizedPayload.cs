using AOC.Domain.Contracts;

namespace AOC.Api.Shared;

public sealed record SanitizedPayload(
    List<ChoiceOption>? Options = null,
    int? CodeLength = null
);
