import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Plus, Search, Trash2 } from "lucide-react";
import { SidePanel } from "@/components/shared/ui/SidePanel";
import { ConfirmActionPanel } from "@/components/shared/ui/ConfirmActionPanel";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import {
  SET_ROUND_TABS,
  bankRoundHint,
  slotGroups,
  type SetRound,
} from "./setTemplate";
import { toBankData, type BankData } from "./bankTypes";

const logger = createLogger("SetFillPanel");

export interface SetItemView {
  slot: string;
  round: string;
  bankCode: string;
  content: string;
  answer: string;
  bankMissing: boolean;
}

export interface SetDetailView {
  setCode: string;
  setName: string;
  matchCode: string | null;
  status: string;
  activeMatchCode: string | null;
  items: SetItemView[];
  rounds: { round: string; expected: number; filled: number; missing: string[] }[];
}

interface SetFillPanelProps {
  setCode: string | null;
  onClose: () => void;
  onChanged: () => void;
}

const inputClass =
  "px-3 py-2 rounded-lg bg-blue-900 border border-blue-700 text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm";

/** Sidebar Excel điền bộ đề: dòng template slot, pick từ bank đã duyệt. */
export function SetFillPanel({ setCode, onClose, onChanged }: SetFillPanelProps) {
  const open = setCode !== null;
  const [detail, setDetail] = useState<SetDetailView | null>(null);
  const [loading, setLoading] = useState(false);
  const [round, setRound] = useState<SetRound>("KD_C");
  const [pickSlot, setPickSlot] = useState<string | null>(null);
  const [kdrTurn, setKdrTurn] = useState(1);
  const [bankQuery, setBankQuery] = useState("");
  const [bankRows, setBankRows] = useState<BankData[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [gmRows, setGmRows] = useState<BankData[]>([]);
  const [matchEdit, setMatchEdit] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<
    | { kind: "delete-set" }
    | { kind: "activate" }
    | { kind: "remove-item"; slot: string }
    | null
  >(null);

  const fetchDetail = useCallback(async () => {
    if (!setCode) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/question-sets/${encodeURIComponent(setCode)}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (json.status === "success" && json.data) {
        setDetail(json.data as SetDetailView);
        setMatchEdit((json.data as SetDetailView).matchCode ?? "");
      } else {
        setDetail(null);
      }
    } catch (err) {
      logger.error("Error fetching set:", err);
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [setCode]);

  useEffect(() => {
    if (open) {
      setPickSlot(null);
      setBankQuery("");
      setBankRows([]);
      setGmRows([]);
      void fetchDetail();
    } else {
      setDetail(null);
    }
  }, [open, fetchDetail]);

  const refresh = useCallback(async () => {
    await fetchDetail();
    onChanged();
  }, [fetchDetail, onChanged]);

  const callSet = useCallback(
    async (path: string, init?: RequestInit): Promise<boolean> => {
      if (!setCode) return false;
      setSaving(true);
      try {
        const res = await fetch(`${API_BASE_URL}/question-sets/${encodeURIComponent(setCode)}${path}`, {
          credentials: "include",
          ...init,
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || json?.status !== "success") {
          alert(`Thất bại: ${json?.message ?? `HTTP ${res.status}`}`);
          return false;
        }
        await refresh();
        return true;
      } catch (err) {
        logger.error("Error calling set API:", err);
        alert("Lỗi kết nối");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [setCode, refresh],
  );

  const searchBank = useCallback(async (queryOverride?: string) => {
    if (!pickSlot) return;
    setBankLoading(true);
    try {
      const params = new URLSearchParams();
      const q = (queryOverride ?? bankQuery).trim();
      if (q) params.set("q", q);
      params.set("round_hint", bankRoundHint(round));
      if (round === "VD") {
        const m = /^VD_([A-Z]+)_(\d+)$/.exec(pickSlot);
        if (m) {
          params.set("domain", m[1]);
          params.set("difficulty", m[2]);
        }
      }
      params.set("status", "approved");
      params.set("limit", "20");
      params.set("page", "1");
      const res = await fetch(`${API_BASE_URL}/bank/search?${params.toString()}`, {
        credentials: "include",
      });
      const json = await res.json();
      const rows = (json?.data?.rows ?? []) as Record<string, unknown>[];
      setBankRows(rows.map(toBankData));
    } catch (err) {
      logger.error("Error searching bank:", err);
      setBankRows([]);
    } finally {
      setBankLoading(false);
    }
  }, [bankQuery, pickSlot, round]);

  const loadGmSets = useCallback(async () => {
    setBankLoading(true);
    try {
      const params = new URLSearchParams({
        round_hint: "GM",
        status: "approved",
        limit: "100",
        page: "1",
      });
      const res = await fetch(`${API_BASE_URL}/bank/search?${params.toString()}`, {
        credentials: "include",
      });
      const json = await res.json();
      const rows = (json?.data?.rows ?? []) as Record<string, unknown>[];
      setGmRows(rows.map(toBankData));
    } catch (err) {
      logger.error("Error loading GM sets:", err);
      setGmRows([]);
    } finally {
      setBankLoading(false);
    }
  }, []);

  // Vào chế độ pick là tự tải danh sách bank ngay, khỏi bấm Tìm.
  useEffect(() => {
    if (pickSlot) {
      setBankQuery("");
      setBankRows([]);
      void searchBank("");
    }
  }, [pickSlot, searchBank]);

  const pickIntoSlot = useCallback(
    async (bankCode: string) => {
      if (!pickSlot) return;
      const okCall = await callSet("/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ round, slot: pickSlot, bankCode }),
      });
      if (okCall) setPickSlot(null);
    },
    [callSet, pickSlot, round],
  );

  const pickGmSet = useCallback(
    async (gmSetCode: string) => {
      const okCall = await callSet("/pick-gm-set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setCode: gmSetCode }),
      });
      if (okCall) setPickSlot(null);
    },
    [callSet],
  );

  const saveMatchCode = useCallback(async () => {
    await callSet("", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchCode: matchEdit.trim() || null }),
    });
  }, [callSet, matchEdit]);

  const itemBySlot = new Map((detail?.items ?? []).map((i) => [i.slot, i]));
  const isDraft = detail?.status === "draft";
  const gmGroups = (() => {
    const acc = new Map<string, BankData[]>();
    for (const r of gmRows) {
      const k = r.set_code || "(chưa set)";
      const arr = acc.get(k) ?? [];
      arr.push(r);
      acc.set(k, arr);
    }
    return [...acc.entries()].filter(([k]) => k !== "(chưa set)");
  })();

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title={detail ? `Bảng ${detail.setName}` : "Bảng bộ đề"}
      wide
      footer={
        detail && !loading ? (
          <div className="flex gap-2 justify-end flex-wrap">
            {detail.status === "draft" ? (
              <>
                <button
                  onClick={() => setConfirm({ kind: "delete-set" })}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-red-700/70 hover:bg-red-600 disabled:opacity-50 text-sm"
                >
                  Xoá bộ
                </button>
                <button
                  onClick={() => void callSet("/ready", { method: "POST" })}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 font-semibold text-sm"
                >
                  {saving ? "…" : "Sẵn sàng"}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => void callSet("/reopen", { method: "POST" })}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-50 text-sm"
                >
                  Mở lại nháp
                </button>
                <button
                  onClick={() => setConfirm({ kind: "activate" })}
                  disabled={saving || !detail.matchCode}
                  title={!detail.matchCode ? "Gán mã trận trước" : undefined}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 font-semibold text-sm"
                >
                  Kích hoạt cho trận
                </button>
              </>
            )}
          </div>
        ) : undefined
      }
    >
      {loading || !detail ? (
        <p className="text-gray-400 text-sm py-8 text-center">Đang tải…</p>
      ) : (
        <>
          <div className="flex flex-col gap-2 rounded-lg bg-white/5 border border-white/10 p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-blue-300">{detail.setCode}</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] ${
                  detail.status === "ready"
                    ? "bg-green-600/20 text-green-300"
                    : "bg-yellow-600/20 text-yellow-300"
                }`}
              >
                {detail.status === "ready" ? "Sẵn sàng" : "Nháp"}
              </span>
              {detail.activeMatchCode && (
                <span className="px-2 py-0.5 rounded-full text-[11px] bg-blue-600/20 text-blue-300">
                  Đang live {detail.activeMatchCode}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                value={matchEdit}
                onChange={(e) => setMatchEdit(e.target.value.toUpperCase())}
                placeholder="Mã trận (VD: OC4_M01T)"
                disabled={!isDraft}
                className={`${inputClass} flex-1 min-w-0 font-mono disabled:opacity-50`}
              />
              {isDraft && (
                <button
                  onClick={() => void saveMatchCode()}
                  disabled={saving}
                  className="px-3 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-sm"
                >
                  Gán
                </button>
              )}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {detail.rounds.map((r) => (
                <span
                  key={r.round}
                  className={`px-2 py-0.5 rounded-full text-[11px] font-mono ${
                    r.filled === r.expected ? "bg-green-600/20 text-green-300" : "bg-white/5 text-gray-400"
                  }`}
                >
                  {r.round} {r.filled}/{r.expected}
                </span>
              ))}
            </div>
          </div>

          <div className="flex gap-1.5 flex-wrap">
            {SET_ROUND_TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => { setRound(t.id); setPickSlot(null); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  round === t.id ? "bg-blue-600/30 text-blue-100" : "text-gray-400 hover:text-white bg-white/5"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {round === "GM" ? (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <button
                  onClick={() => void loadGmSets()}
                  disabled={bankLoading || !isDraft}
                  className="px-3 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-sm"
                >
                  {bankLoading ? "Đang tải…" : "Tải set GM đã duyệt"}
                </button>
              </div>
              {gmGroups.map(([setCodeG, rows]) => {
                const have = new Set(rows.map((r) => r.hint_index));
                const missing = ["KEY", "H1", "H2", "H3", "H4", "H5", "H6", "H7", "H8"].filter((h) => !have.has(h));
                const key = rows.find((r) => r.hint_index === "KEY");
                return (
                  <div key={setCodeG} className="rounded-lg bg-black/30 border border-white/10 p-3 flex flex-col gap-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm text-amber-300">{setCodeG}</span>
                      {key && <span className="text-sm text-white truncate">KEY: {key.answer}</span>}
                      <span className="text-xs text-gray-500">
                        {rows.length}/9{missing.length > 0 && ` · thiếu ${missing.join(",")}`}
                      </span>
                      {isDraft && missing.length === 0 && (
                        <button
                          onClick={() => void pickGmSet(setCodeG)}
                          disabled={saving}
                          className="ml-auto px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-semibold"
                        >
                          Pick cả set
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : pickSlot ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPickSlot(null)}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs"
                >
                  <ArrowLeft size={13} /> {pickSlot}
                </button>
                <input
                  value={bankQuery}
                  onChange={(e) => setBankQuery(e.target.value)}
                  placeholder={`Tìm bank cho slot ${pickSlot}…`}
                  className={`${inputClass} flex-1 min-w-0`}
                />
                <button
                  onClick={() => void searchBank()}
                  disabled={bankLoading}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-sm"
                >
                  <Search size={14} /> Tìm
                </button>
              </div>
              {bankLoading ? (
                <p className="text-gray-500 text-sm py-4 text-center">Đang tìm…</p>
              ) : (
                bankRows.map((q) => (
                  <div key={q.bank_id} className="flex items-center gap-2 text-sm">
                    <p className="flex-1 truncate">
                      <span className="font-mono text-xs text-green-300">{q.bank_code}</span>{" "}
                      <span className="text-white">{q.content}</span>
                    </p>
                    <button
                      onClick={() => void pickIntoSlot(q.bank_code)}
                      disabled={saving}
                      className="px-2 py-1 rounded text-xs text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 whitespace-nowrap"
                    >
                      Vào {pickSlot}
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : (
            <>
            {round === "KD_R" && (
              <div className="flex gap-1.5 flex-wrap">
                {[1, 2, 3, 4].map((t) => (
                  <button
                    key={t}
                    onClick={() => setKdrTurn(t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      kdrTurn === t ? "bg-emerald-600/30 text-emerald-100" : "text-gray-400 hover:text-white bg-white/5"
                    }`}
                  >
                    Lượt {t}
                  </button>
                ))}
              </div>
            )}
            {slotGroups(round)
              .filter((g) => round !== "KD_R" || g.label === `Lượt ${kdrTurn}`)
              .map((g) => (
              <div key={g.label || "all"} className="flex flex-col gap-1">
                {g.label && <p className="text-xs font-semibold text-gray-400">{g.label}</p>}
                <table className="w-full text-sm">
                  <tbody>
                    {g.slots.map((s) => {
                      const item = itemBySlot.get(s);
                      return (
                        <tr key={s} className="border-b border-white/5 align-top">
                          <td className="py-1.5 pr-2 font-mono text-xs text-blue-300 whitespace-nowrap w-24">{s}</td>
                          <td className="py-1.5 pr-2">
                            {item ? (
                              <>
                                <p className="text-white truncate">
                                  <span className="font-mono text-[11px] text-green-300">{item.bankCode}</span>{" "}
                                  {item.content}
                                </p>
                                {item.bankMissing && (
                                  <p className="text-[11px] text-red-300">Câu bank không còn dùng được — gỡ rồi pick lại.</p>
                                )}
                              </>
                            ) : (
                              <p className="text-gray-600 text-xs italic">Trống</p>
                            )}
                          </td>
                          <td className="py-1.5 text-right whitespace-nowrap w-20">
                            {isDraft && (
                              item ? (
                                <button
                                  onClick={() => setConfirm({ kind: "remove-item", slot: s })}
                                  className="p-1.5 rounded bg-red-700/70 hover:bg-red-600 transition-colors"
                                  title="Gỡ khỏi bộ"
                                >
                                  <Trash2 size={13} />
                                </button>
                              ) : (
                                <button
                                  onClick={() => setPickSlot(s)}
                                  className="p-1.5 rounded bg-emerald-600/70 hover:bg-emerald-500 transition-colors"
                                  title={`Thêm vào ${s}`}
                                >
                                  <Plus size={13} />
                                </button>
                              )
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
            </>
          )}

        </>
      )}

      <ConfirmActionPanel
        open={confirm?.kind === "activate"}
        title="Kích hoạt bộ đề?"
        tone="danger"
        itemCode={detail?.setCode}
        message={`Copy toàn bộ ${detail?.items.length ?? 0} câu vào trận ${detail?.matchCode}, GHI ĐÈ câu hỏi hiện tại của trận.`}
        confirmLabel="Kích hoạt"
        saving={saving}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          const okCall = await callSet("/activate", { method: "POST" });
          if (okCall) setConfirm(null);
        }}
      />
      <ConfirmActionPanel
        open={confirm?.kind === "delete-set"}
        title="Xoá bộ đề?"
        tone="danger"
        itemCode={detail?.setCode}
        message={`Xoá ${detail?.setName}?`}
        confirmLabel="Xoá"
        saving={saving}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          const okCall = await callSet("", { method: "DELETE" });
          if (okCall) {
            setConfirm(null);
            onClose();
          }
        }}
      />
      <ConfirmActionPanel
        open={confirm?.kind === "remove-item"}
        title="Gỡ câu khỏi bộ?"
        tone="danger"
        itemCode={confirm?.kind === "remove-item" ? confirm.slot : undefined}
        message="Dòng này sẽ trống lại."
        confirmLabel="Gỡ"
        saving={saving}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (confirm?.kind !== "remove-item") return;
          const okCall = await callSet(`/items/${encodeURIComponent(confirm.slot)}`, { method: "DELETE" });
          if (okCall) setConfirm(null);
        }}
      />
    </SidePanel>
  );
}

export default SetFillPanel;
