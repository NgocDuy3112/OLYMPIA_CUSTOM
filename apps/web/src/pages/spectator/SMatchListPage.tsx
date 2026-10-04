import React, { useEffect, useState } from "react";
import { apiGet } from "@/api/client";
import { PublicLayout } from "@/components/layout";
import { TournamentCard } from "@/components/tournament";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";

interface Tournament {
  id: string;
  tournamentCode: string;
  tournamentName: string;
  description?: string;
  tournamentFormat: string;
  startDate?: string;
  endDate?: string;
  status: string;
  maxPlayers?: string;
  venue?: string;
  playerCount?: number;
  createdAt: string;
}

const SMatchListPage: React.FC = () => {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTournaments = async () => {
      try {
        const data = await apiGet<Tournament[]>("/tournaments");
        if (data.data) {
          setTournaments(data.data);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load tournaments",
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchTournaments();
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="size-12" />
      </div>
    );
  }

  if (error) {
    return (
      <PublicLayout>
        <div className="flex justify-center items-center p-4">
          <div className="card text-center w-full max-w-md">
            <p className="text-destructive mb-4">{error}</p>
            <Button
              onClick={() => window.location.reload()}
            >
              Thử lại
            </Button>
          </div>
        </div>
      </PublicLayout>
    );
  }

  return (
      <PublicLayout>
        <div className="max-w-4xl mx-auto">
          {}
          <div className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
              OLYMPIA CUSTOM
            </h1>
            <p className="text-brand text-sm sm:text-base">
              Nền tảng thi đấu trực tuyến
            </p>
          </div>

          {}
          <div>
            <h2 className="text-xl font-bold text-foreground mb-4">Giải đấu</h2>
            {tournaments.length === 0 ? (
              <div className="card text-center py-12">
                <p className="text-muted-foreground">Chưa có giải đấu nào</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {tournaments.map((tournament) => (
                  <TournamentCard
                    key={tournament.id}
                    {...tournament}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </PublicLayout>
  );
};

export default SMatchListPage;
