namespace AOC.Domain.Gameplay.Turns;

public sealed record TieBreakRules(int PointsPerCorrect = 10, int BuzzWindowS = 5, bool ReopenBuzzOnWrong = true);
