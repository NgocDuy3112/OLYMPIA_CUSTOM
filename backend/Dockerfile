FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY Olympia.Domain/Olympia.Domain.csproj Olympia.Domain/
COPY Olympia.Infrastructure/Olympia.Infrastructure.csproj Olympia.Infrastructure/
COPY Olympia.Api/Olympia.Api.csproj Olympia.Api/
RUN dotnet restore Olympia.Api/Olympia.Api.csproj

COPY . .
RUN dotnet publish Olympia.Api/Olympia.Api.csproj -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

# curl powers the compose healthcheck against /health.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/publish .
# Schema stays owned by the SQL migrations (applied on start, like drizzle-kit migrate).
COPY migrations ./migrations

ENV NODE_ENV=production
EXPOSE 3000

CMD ["sh", "-c", "ASPNETCORE_URLS=http://+:${PORT:-3000} exec dotnet Olympia.Api.dll"]
