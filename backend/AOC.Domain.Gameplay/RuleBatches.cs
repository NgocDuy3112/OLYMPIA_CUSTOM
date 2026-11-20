using System.Text.Json;
using AOC.Domain.Contracts;

namespace AOC.Domain.Gameplay;

public static class RuleBatches
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true
    };

    public static readonly RoundRules.KhoiDongRules KhoiDong = new(
        "v1", 6, 40, 6, 10, 10);

    public static readonly RoundRules.GiaiMaRules GiaiMa = new(
        "v1", 8, 15, 100, 10, 20);

    public static readonly RoundRules.ButPhaRules ButPha = new(
        "v1", 4, 30,
        [new SpeedBand(10, 15), new SpeedBand(20, 10), new SpeedBand(30, 5)],
        [4, 3, 2, 1],
        1);

    public static readonly RoundRules.VeDichRules VeDich = new(
        "v1", 1, -0.5, new RoundRules.VeDichStar(1.5, -1), 5, 3,
        new Dictionary<int, int> { [20] = 15, [30] = 20, [40] = 30, [50] = 45 },
        new RoundRules.VeDichAssign(1, -0.5, -0.5, 0, -0.5));
}
