using AOC.Infrastructure.Data;

namespace AOC.Api.Modules.Questions;

public static class Transitions
{
    private static readonly Dictionary<QuestionStatus, QuestionStatus[]> Edges = new()
    {
        [QuestionStatus.DRAFT] = [QuestionStatus.PUBLISHED, QuestionStatus.ARCHIVED],
        [QuestionStatus.PUBLISHED] = [QuestionStatus.DRAFT, QuestionStatus.ARCHIVED],
        [QuestionStatus.ARCHIVED] = []
    };

    private static readonly HashSet<string> AdminOnly = ["DRAFT→PUBLISHED"];

    public static void AssertTransition(QuestionStatus from, QuestionStatus to, UserRole role)
    {
        if (!Edges[from].Contains(to))
            throw new QuestionError(QuestionErrorCode.INVALID_TRANSITION,
                $"cannot move a question from {from} to {to}",
                [$"allowed from {from}: {(Edges[from].Length > 0 ? string.Join(", ", Edges[from]) : "none")}"]);

        if (AdminOnly.Contains($"{from}→{to}") && role != UserRole.ADMIN)
            throw new QuestionError(QuestionErrorCode.FORBIDDEN,
                $"only an admin may move a question from {from} to {to}");
    }
}
