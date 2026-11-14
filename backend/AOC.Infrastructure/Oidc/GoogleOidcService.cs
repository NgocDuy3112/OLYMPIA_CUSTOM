using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
using AOC.Infrastructure.Configuration;

namespace AOC.Infrastructure.Oidc;

public sealed class GoogleClaims
{
    public string? Sub { get; set; }
    public string? Email { get; set; }
    public bool? EmailVerified { get; set; }
    public string? Name { get; set; }
    public string? Picture { get; set; }
}

public sealed class SignInException(string message) : Exception(message);

public sealed class GoogleOidcService
{
    private readonly HttpClient _http = new();
    private readonly SemaphoreSlim _gate = new(1, 1);
    private OpenIdConnectConfiguration? _configuration;

    public bool Configured => AppConfig.Instance.GoogleOidc.Configured;

    private GoogleOidcOptions Env()
    {
        var opts = AppConfig.Instance.GoogleOidc;
        if (!opts.Configured)
            throw new SignInException(
                "Google OIDC is not configured: set GOOGLE_OIDC_ISSUER, GOOGLE_OIDC_CLIENT_ID, " +
                "GOOGLE_OIDC_CLIENT_SECRET, GOOGLE_OIDC_REDIRECT_URI");
        return opts;
    }

    private async Task<OpenIdConnectConfiguration> GetConfigurationAsync()
    {
        if (_configuration is not null) return _configuration;
        await _gate.WaitAsync();
        try
        {
            if (_configuration is not null) return _configuration;
            var opts = Env();
            var manager = new ConfigurationManager<OpenIdConnectConfiguration>(
                $"{opts.Issuer!.TrimEnd('/')}/.well-known/openid-configuration",
                new OpenIdConnectConfigurationRetriever(),
                new HttpDocumentRetriever());
            _configuration = await manager.GetConfigurationAsync();
            return _configuration;
        }
        finally
        {
            _gate.Release();
        }
    }

    public (string State, string Nonce, string CodeVerifier, string CodeChallenge) CreateParameters()
    {
        var state = Base64Url(RandomNumberGenerator.GetBytes(16));
        var nonce = Base64Url(RandomNumberGenerator.GetBytes(16));
        var verifier = Base64Url(RandomNumberGenerator.GetBytes(32));
        var challenge = Base64Url(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)));
        return (state, nonce, verifier, challenge);
    }

    public async Task<string> BuildAuthorizationUrlAsync(
        string redirectUri, string state, string nonce, string codeChallenge)
    {
        var config = await GetConfigurationAsync();
        var opts = Env();
        var query = new Dictionary<string, string>
        {
            ["client_id"] = opts.ClientId!,
            ["redirect_uri"] = redirectUri,
            ["response_type"] = "code",
            ["scope"] = "openid email profile",
            ["state"] = state,
            ["nonce"] = nonce,
            ["code_challenge"] = codeChallenge,
            ["code_challenge_method"] = "S256"
        };
        var uri = new UriBuilder(config.AuthorizationEndpoint);
        var qs = string.Join("&", query.Select(kv =>
            $"{Uri.EscapeDataString(kv.Key)}={Uri.EscapeDataString(kv.Value)}"));
        uri.Query = string.IsNullOrEmpty(uri.Query) ? qs : $"{uri.Query.TrimStart('?')}&{qs}";
        return uri.Uri.ToString();
    }

    public async Task<GoogleClaims> ExchangeCodeAsync(
        string currentUrl, string code, string codeVerifier, string expectedNonce)
    {
        var config = await GetConfigurationAsync();
        var opts = Env();

        using var request = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code",
            ["code"] = code,
            ["redirect_uri"] = opts.RedirectUri!,
            ["client_id"] = opts.ClientId!,
            ["client_secret"] = opts.ClientSecret!,
            ["code_verifier"] = codeVerifier
        });
        using var response = await _http.PostAsync(config.TokenEndpoint, request);
        var body = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
            throw new SignInException("Google sign-in failed, try again");

        using var doc = JsonDocument.Parse(body);
        if (!doc.RootElement.TryGetProperty("id_token", out var idTokenEl))
            throw new SignInException("Google returned no identity");
        var idToken = idTokenEl.GetString()
            ?? throw new SignInException("Google returned no identity");

        var principal = ValidateIdToken(idToken, config, expectedNonce);
        var sub = principal.FindFirst("sub")?.Value;
        if (string.IsNullOrEmpty(sub))
            throw new SignInException("Google returned no identity");

        return new GoogleClaims
        {
            Sub = sub,
            Email = principal.FindFirst("email")?.Value,
            EmailVerified = principal.FindFirst("email_verified")?.Value is "true",
            Name = principal.FindFirst("name")?.Value,
            Picture = principal.FindFirst("picture")?.Value
        };
    }

    private static ClaimsPrincipal ValidateIdToken(
        string idToken, OpenIdConnectConfiguration config, string expectedNonce)
    {
        var handler = new JwtSecurityTokenHandler { MapInboundClaims = false };
        var parameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = config.Issuer,
            ValidateAudience = true,
            ValidAudience = AppConfig.Instance.GoogleOidc.ClientId,
            ValidateIssuerSigningKey = true,
            IssuerSigningKeys = config.SigningKeys,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(2)
        };

        ClaimsPrincipal principal;
        try
        {
            principal = handler.ValidateToken(idToken, parameters, out _);
        }
        catch (Exception ex) when (ex is SecurityTokenException or ArgumentException)
        {
            throw new SignInException("Google sign-in failed, try again");
        }

        if (principal.FindFirst("nonce")?.Value != expectedNonce)
            throw new SignInException("Google sign-in failed, try again");

        return principal;
    }

    public static string Base64Url(byte[] bytes)
        => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    /// <summary>Extract ?code= from the callback URL.</summary>
    public static string? CodeFromCallback(string currentUrl)
    {
        var uri = new Uri(currentUrl);
        foreach (var pair in uri.Query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var kv = pair.Split('=', 2);
            if (kv[0] == "code")
                return kv.Length > 1 ? Uri.UnescapeDataString(kv[1]) : null;
        }
        return null;
    }
}
