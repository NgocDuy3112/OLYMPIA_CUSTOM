using System.Security.Cryptography;
using System.Text;
using Konscious.Security.Cryptography;

namespace AOC.Infrastructure.Auth;

/// <summary>
/// Verifies (and creates) node-argon2 compatible PHC hashes:
/// $argon2id$v=19$m=65536,t=3,p=4$&lt;salt-b64&gt;$&lt;hash-b64&gt;
/// Existing rows were written by node-argon2 with its defaults.
/// </summary>
public static class PasswordHasher
{
    private const int DefaultMemoryKb = 65536;
    private const int DefaultTimeCost = 3;
    private const int DefaultParallelism = 4;
    private const int HashLength = 32;
    private const int SaltLength = 16;

    public static async Task<bool> VerifyAsync(string hash, string password)
    {
        try
        {
            var parts = hash.Split('$');
            // ["", "argon2id", "v=19", "m=65536,t=3,p=4", salt, hash]
            if (parts.Length != 6 || parts[1] != "argon2id") return false;

            var parameters = parts[3].Split(',');
            var memory = int.Parse(parameters[0].Split('=')[1]);
            var iterations = int.Parse(parameters[1].Split('=')[1]);
            var parallelism = int.Parse(parameters[2].Split('=')[1]);

            var salt = Convert.FromBase64String(parts[4]);
            var expected = Convert.FromBase64String(parts[5]);

            var actual = await DeriveAsync(password, salt, memory, iterations, parallelism, expected.Length);
            return CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch (Exception ex) when (ex is FormatException or ArgumentException or IndexOutOfRangeException)
        {
            return false;
        }
    }

    public static async Task<string> HashAsync(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltLength);
        var hash = await DeriveAsync(password, salt, DefaultMemoryKb, DefaultTimeCost, DefaultParallelism, HashLength);
        return $"$argon2id$v=19$m={DefaultMemoryKb},t={DefaultTimeCost},p={DefaultParallelism}" +
               $"${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";
    }

    private static async Task<byte[]> DeriveAsync(
        string password, byte[] salt, int memoryKb, int iterations, int parallelism, int length)
    {
        return await Task.Run(() =>
        {
            using var argon2 = new Argon2id(Encoding.UTF8.GetBytes(password))
            {
                Salt = salt,
                DegreeOfParallelism = parallelism,
                MemorySize = memoryKb,   // Konscious takes kilobytes, like the PHC param
                Iterations = iterations
            };
            return argon2.GetBytes(length);
        });
    }
}
