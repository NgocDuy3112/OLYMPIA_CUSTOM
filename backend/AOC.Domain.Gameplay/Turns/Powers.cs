using System.Text.Json.Serialization;
using AOC.Domain.Contracts;

namespace AOC.Domain.Gameplay.Turns;

public sealed record PowerSet
{
    [JsonPropertyName("available")] public List<PowerKind> Available { get; init; } = [];
    [JsonPropertyName("usedThisTurn")] public bool UsedThisTurn { get; init; }

    [JsonPropertyName("staged")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public StagedPower? Staged { get; init; }

    public static PowerSet Fresh() => new() { Available = [PowerKind.STAR, PowerKind.ASSIGN] };

    public void AssertAvailable(PowerKind kind)
    {
        if (!Available.Contains(kind))
            throw Fail.At("POWER_UNAVAILABLE", $"{kind} is already spent this round");
    }

    public void AssertOnePerTurn()
    {
        if (UsedThisTurn)
            throw Fail.At("ONE_POWER_PER_TURN", "this turn already used a power");
    }

    public PowerSet Stage(PowerKind kind, string? targetId)
    {
        AssertAvailable(kind);
        AssertOnePerTurn();

        if (kind == PowerKind.ASSIGN && targetId is null)
            throw Fail.At("INVALID_TARGET", "ASSIGN needs a player to hand the question to");

        return this with
        {
            Staged = new StagedPower { Power = kind, TargetId = targetId },
            UsedThisTurn = true
        };
    }

    public PowerSet Spend(PowerKind kind)
    {
        AssertAvailable(kind);
        // One power per turn (Về đích Riêng): spending either one uses the
        // turn's only power — the other never becomes available.
        return this with { Available = [] };
    }

    public PowerSet ClearTurn() => this with { UsedThisTurn = false, Staged = null };

    /// <summary>
    /// A new turn re-arms the full power set: each contestant gets one fresh
    /// STAR/ASSIGN choice on their own turn.
    /// </summary>
    public PowerSet ResetForTurn() => Fresh();

    /// <summary>Un-staging hands the turn's power back — nothing was spent yet.</summary>
    public PowerSet Unstage() => this with { Staged = null, UsedThisTurn = false };
}
