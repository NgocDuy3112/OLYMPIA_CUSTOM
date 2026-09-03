import React, { useEffect, useState } from "react";
import { API_BASE_URL } from "@/configs";
import { PublicHeader, PublicFooter } from "@/components/layout";
import { TournamentCard } from "@/components/tournament";
import { PageLoading } from "@/components/shared/ui";

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
        const response = await fetch(`${API_BASE_URL}/tournaments`, {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Failed to fetch tournaments");
        }

        const data = await response.json();
        if (data.status === "success" && data.data) {
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
    return <PageLoading />;
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col">
        <PublicHeader />
        <div className="flex-1 flex justify-center items-center p-4">
          <div className="card text-center w-full max-w-md">
            <p className="text-red-500 mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg"
            >
              Thử lại
            </button>
          </div>
        </div>
        <PublicFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <PublicHeader />

      <main className="flex-1 p-4 sm:p-6">
        <div className="max-w-4xl mx-auto">
          {/* Hero */}
          <div className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
              OLYMPIA CUSTOM
            </h1>
            <p className="text-blue-300 text-sm sm:text-base">
              Nền tảng thi đấu trực tuyến
            </p>
          </div>

          {/* Tournament List */}
          <div>
            <h2 className="text-xl font-bold text-white mb-4">Giải đấu</h2>
            {tournaments.length === 0 ? (
              <div className="card text-center py-12">
                <p className="text-gray-400">Chưa có giải đấu nào</p>
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
      </main>

      <PublicFooter />
    </div>
  );
};

export default SMatchListPage;
