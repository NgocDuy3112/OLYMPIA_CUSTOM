import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { API_BASE_URL } from "@/configs";
import { PublicLayout } from "@/components/layout";
import { Card, PageLoading } from "@/components/shared/ui";

interface PublicProfile {
  userCode: string;
  userName: string;
  role: string;
  avatarUrl?: string | null;
  createdAt?: string;
}

const PublicProfilePage: React.FC = () => {
  const { userCode } = useParams<{ userCode: string }>();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userCode) return;
    const fetchProfile = async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/users/by-code/${encodeURIComponent(userCode)}`,
        );
        const json = await res.json();
        if (!res.ok || json.status !== "success") {
          throw new Error(json.message ?? "Không tìm thấy người dùng");
        }
        setProfile(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Lỗi không xác định");
      } finally {
        setLoading(false);
      }
    };
    void fetchProfile();
  }, [userCode]);

  if (loading) return <PageLoading />;
  if (error || !profile) {
    return (
      <PublicLayout>
        <p className="text-red-400 text-center py-12">
          {error ?? "Không tìm thấy người dùng"}
        </p>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="max-w-2xl mx-auto">
        <Card>
          <div className="flex items-center gap-4">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={profile.userName}
                className="w-16 h-16 rounded-full object-cover border-2 border-blue-500"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-2xl font-bold text-white">
                {profile.userName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-white truncate">
                {profile.userName}
              </h1>
              <p className="text-sm text-gray-400 font-mono">
                {profile.userCode}
              </p>
            </div>
            <span className="ml-auto px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/50 text-xs font-bold uppercase">
              {profile.role}
            </span>
          </div>
        </Card>
      </div>
    </PublicLayout>
  );
};

export default PublicProfilePage;
