import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Pencil, LogOut, Trophy, Camera } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { PublicLayout } from "@/components/layout";
import { Button, Card, PageLoading } from "@/components/shared/ui";
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
      const putRes = await fetch(putUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error("Upload ảnh thất bại");
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
    }
  };

  if (loading) return <PageLoading />;
  if (error || !profile) {
    return (
      <PublicLayout>
        <p className="text-red-400 text-center py-12">
          {error ?? "Không tìm thấy hồ sơ"}
        </p>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="max-w-2xl mx-auto flex flex-col gap-4">
        <Card>
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
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
              <label
                className="absolute -bottom-1 -right-1 p-1.5 bg-blue-600 hover:bg-blue-500 rounded-full cursor-pointer transition-colors"
                title="Đổi avatar"
              >
                <Camera size={14} className="text-white" />
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
                <input
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-lg font-bold"
                  maxLength={100}
                />
              ) : (
                <h1 className="text-xl font-bold text-white truncate">
                  {profile.userName}
                </h1>
              )}
              <p className="text-sm text-gray-400 font-mono">
                {profile.userCode}
              </p>
              <p className="text-sm text-gray-400">{profile.email}</p>
            </div>
            <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/50 text-xs font-bold uppercase">
              {profile.role}
            </span>
          </div>
          <div className="flex gap-2 mt-4">
            {editing ? (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  isLoading={saving}
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
                leftIcon={<Pencil size={16} />}
                onClick={() => setEditing(true)}
              >
                Sửa tên
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<LogOut size={16} />}
              onClick={() => void handleLogout()}
            >
              Đăng xuất
            </Button>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 text-white font-bold">
            <Trophy size={18} className="text-amber-400" />
            <span>Giải đấu đã tham gia</span>
          </div>
          {tournamentsLoading ? (
            <p className="text-sm text-gray-400 mt-2">Đang tải...</p>
          ) : tournaments.length === 0 ? (
            <p className="text-sm text-gray-400 mt-2">
              Bạn chưa tham gia giải đấu nào.
            </p>
          ) : (
            <div className="flex flex-col gap-2 mt-3">
              {tournaments.map((t) => (
                <button
                  key={t.tournamentCode}
                  onClick={() => navigate(`/tournament/${t.tournamentCode}`)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-left cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">
                      {t.tournamentName}
                    </p>
                    <p className="text-xs text-gray-400 font-mono">
                      {t.tournamentCode} · {t.tournamentFormat.toUpperCase()} ·{" "}
                      {t.status}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-blue-600/20 text-blue-300 border border-blue-500/50 text-xs font-bold uppercase shrink-0">
                    {t.role}
                    {t.groupNumber ? ` · ${t.groupNumber}` : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>
    </PublicLayout>
  );
};

export default ProfilePage;
