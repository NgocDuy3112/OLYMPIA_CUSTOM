FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY AOC.Domain/AOC.Domain.csproj AOC.Domain/
COPY AOC.Infrastructure/AOC.Infrastructure.csproj AOC.Infrastructure/
COPY AOC.Api/AOC.Api.csproj AOC.Api/
RUN dotnet restore AOC.Api/AOC.Api.csproj

COPY . .
RUN dotnet publish AOC.Api/AOC.Api.csproj -c Release -o /app/publish /p:UseAppHost=false

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

CMD ["sh", "-c", "ASPNETCORE_URLS=http://+:${PORT:-3000} exec dotnet AOC.Api.dll"]
