import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Pencil, LogOut, Trophy, Camera, X } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { useAvatarSrc } from "@/hooks/useAvatarSrc";
import { putFileWithProgress } from "@/lib/upload";
import { Progress } from "@/components/ui/progress";
import { PublicLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";

interface MeProfile {
  userCode: string;
  userName: string;
  email: string;
  role: string;
  avatarUrl?: string | null;
  createdAt?: string;
}

interface MyTournament {
  tournamentCode: string;
  tournamentName: string;
  tournamentFormat: string;
  status: string;
  role: string;
  groupNumber?: string | null;
}

const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [userName, setUserName] = useState("");
  const [saving, setSaving] = useState(false);
  const [tournaments, setTournaments] = useState<MyTournament[]>([]);
  const [tournamentsLoading, setTournamentsLoading] = useState(true);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const { src: avatarSrc, retry: retryAvatar } = useAvatarSrc(profile?.avatarUrl);

  useEffect(() => {
    const fetchMe = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/users/me`, {
          credentials: "include",
        });
        const json = await res.json();
        if (!res.ok || json.status !== "success") {
          throw new Error(json.message ?? "Không tải được hồ sơ");
        }
        setProfile(json.data);
        setUserName(json.data.userName ?? "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Lỗi không xác định");
      } finally {
        setLoading(false);
      }
    };
    const fetchTournaments = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/tournaments/me`, {
          credentials: "include",
        });
        const json = await res.json();
        if (res.ok && json.status === "success" && Array.isArray(json.data)) {
          setTournaments(json.data);
        }
      } catch {
        /* ignore — tournaments tab stays empty */
      } finally {
        setTournamentsLoading(false);
      }
    };
    void fetchMe();
    void fetchTournaments();
  }, []);

  const handleSave = async () => {
    if (!userName.trim()) return;
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/users/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userName: userName.trim() }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== "success") {
        throw new Error(json.message ?? "Cập nhật thất bại");
      }
      setProfile((prev) =>
        prev ? { ...prev, userName: userName.trim() } : prev,
      );
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cập nhật thất bại");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const handleAvatarChange = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Chỉ chấp nhận file ảnh");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Ảnh tối đa 2MB");
      return;
    }
    setError(null);
    setUploadingAvatar(true);
    try {
      // 1. Get presigned PUT url
      const key = `avatars/${profile?.userCode}/${Date.now()}_${file.name}`;
      const presignRes = await fetch(
        `${API_BASE_URL}/media/presign-put/?key=${encodeURIComponent(key)}&contentType=${encodeURIComponent(file.type)}`,
        { credentials: "include" },
      );
      const presignJson = await presignRes.json();
      if (!presignRes.ok || presignJson.status !== "success") {
        throw new Error(presignJson.message ?? "Không tạo được upload URL");
      }
      const putUrl: string = presignJson.data.url;
      // 2. PUT file to S3
      setUploadPct(0);
      await putFileWithProgress(putUrl, file, setUploadPct);
      // 3. Save avatar key to profile
      const patchRes = await fetch(`${API_BASE_URL}/users/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ avatarUrl: key }),
      });
      const patchJson = await patchRes.json();
      if (!patchRes.ok || patchJson.status !== "success") {
        throw new Error(patchJson.message ?? "Lưu avatar thất bại");
      }
      setProfile((prev) => (prev ? { ...prev, avatarUrl: key } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload avatar thất bại");
    } finally {
      setUploadingAvatar(false);
      setUploadPct(null);
    }
  };

  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="size-12" />
      </div>
    );
  // Không tải được profile → trang lỗi riêng;
  // lỗi thao tác (sửa tên/upload avatar) chỉ hiện banner trong trang.
  if (!profile) {
    return (
      <PublicLayout>
        <p className="text-destructive text-center py-12">
          {error ?? "Không tìm thấy hồ sơ"}
        </p>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="max-w-2xl mx-auto flex flex-col gap-4">
        {error && (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/15 px-4 py-3">
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Đóng lỗi"
              className="shrink-0 text-destructive/80 transition-colors hover:text-destructive"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <Card className="px-4">
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
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
              <label
                className="absolute -bottom-1 -right-1 p-1.5 bg-primary hover:bg-primary/90 rounded-full cursor-pointer transition-colors"
                title="Đổi avatar"
              >
                <Camera size={14} className="text-foreground" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingAvatar}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleAvatarChange(file);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <div className="flex-1 min-w-0">
              {editing ? (
                <Input
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-accent border border-border text-foreground text-lg font-bold"
                  maxLength={100}
                />
              ) : (
                <h1 className="text-xl font-bold text-foreground truncate">
                  {profile.userName}
                </h1>
              )}
              <p className="text-sm text-muted-foreground font-mono">
                {profile.userCode}
              </p>
              <p className="text-sm text-muted-foreground">{profile.email}</p>
            </div>
            <span className="px-3 py-1 rounded-full bg-warning/20 text-warning border border-warning/50 text-xs font-bold uppercase">
              {profile.role}
            </span>
          </div>
          {uploadingAvatar && (
            <div className="mt-3 flex items-center gap-2">
              <Progress value={uploadPct ?? 0} className="flex-1" />
              <span className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                {uploadPct ?? 0}%
              </span>
            </div>
          )}
          <div className="flex gap-2 mt-4">
            {editing ? (
              <>
                <Button
                  size="sm"
                  disabled={saving}
                  onClick={() => void handleSave()}
                >
                  Lưu
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing(false);
                    setUserName(profile.userName);
                  }}
                >
                  Hủy
                </Button>
              </>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setEditing(true)}
              >
                <Pencil size={16} />
                Sửa tên
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleLogout()}
            >
              <LogOut size={16} />
              Đăng xuất
            </Button>
          </div>
        </Card>

        <Card className="px-4">
          <div className="flex items-center gap-2 text-foreground font-bold">
            <Trophy size={18} className="text-warning" />
            <span>Giải đấu đã tham gia</span>
          </div>
          {tournamentsLoading ? (
            <p className="text-sm text-muted-foreground mt-2">Đang tải...</p>
          ) : tournaments.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-2">
              Bạn chưa tham gia giải đấu nào.
            </p>
          ) : (
            <div className="flex flex-col gap-2 mt-3">
              {tournaments.map((t) => (
                <Button
                  variant="ghost"
                  key={t.tournamentCode}
                  onClick={() => navigate(`/tournament/${t.tournamentCode}`)}
                  className="h-auto items-center gap-3 bg-accent/50 px-3 py-2.5 text-left hover:bg-accent"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">
                      {t.tournamentName}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {t.tournamentCode} · {t.tournamentFormat?.toUpperCase() ?? "—"} ·{" "}
                      {t.status}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-primary/20 text-brand border border-primary/50 text-xs font-bold uppercase shrink-0">
                    {t.role}
                    {t.groupNumber ? ` · ${t.groupNumber}` : ""}
                  </span>
                </Button>
              ))}
            </div>
          )}
        </Card>
      </div>
    </PublicLayout>
  );
};

export default ProfilePage;
