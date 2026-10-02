import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { API_BASE_URL } from "@/configs";
import { PublicLayout } from "@/components/layout";
import { useAvatarSrc } from "@/hooks/useAvatarSrc";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

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
  const { src: avatarSrc, retry: retryAvatar } = useAvatarSrc(profile?.avatarUrl);

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

  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="size-12" />
      </div>
    );
  if (error || !profile) {
    return (
      <PublicLayout>
        <p className="text-destructive text-center py-12">
          {error ?? "Không tìm thấy người dùng"}
        </p>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="max-w-2xl mx-auto">
        <Card className="px-4">
          <div className="flex items-center gap-4">
            {avatarSrc ? (
              <img
                src={avatarSrc}
                alt={profile.userName}
                className="w-16 h-16 rounded-full object-cover border-2 border-primary"
                onError={retryAvatar}
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-2xl font-bold text-foreground">
                {(profile.userName ?? "?").charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-foreground truncate">
                {profile.userName}
              </h1>
              <p className="text-sm text-muted-foreground font-mono">
                {profile.userCode}
              </p>
            </div>
            <span className="ml-auto px-3 py-1 rounded-full bg-warning/20 text-warning border border-warning/50 text-xs font-bold uppercase">
              {profile.role}
            </span>
          </div>
        </Card>
      </div>
    </PublicLayout>
  );
};

export default PublicProfilePage;
