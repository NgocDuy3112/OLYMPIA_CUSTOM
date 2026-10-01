# UI/UX Redesign — Olympia Custom (apps/web)

> Ngày: 2026-10 · Phạm vi: toàn bộ 9 surface · Hướng: giữ brand violet, tinh chỉnh
> Nguồn token thật: `apps/web/src/index.css` (file này ghi đè `design-system/olympia-custom/MASTER.md` nếu lệch)

---

## 1. Vấn đề phát hiện khi audit

| # | Vấn đề | Ảnh hưởng | Đã sửa |
|---|--------|-----------|--------|
| 1 | `a { color: #4416d9 }` trên nền `#12102e` ≈ 2.4:1 | Link không đọc được (WCAG fail) | ✓ `--oc-link: #9c8dfa` |
| 2 | Background ảnh `fixed` không scrim | Chữ nổi trên ảnh, khó đọc | ✓ gradient scrim 2 lớp (body + `::before`) |
| 3 | `.card` global padding 2.5rem + max-w cố định | Trang chống lại bằng `p-6!`, auth thêm inline style | ✓ `.card` p-7, bỏ inline style |
| 4 | `PHASE_NAMES` trùng 3 bản; 3 header copy y hệt; connection pill copy nhiều nơi | Sửa 1 chỗ, 2 chỗ quên | ✓ `lib/gameMeta.ts`, `ShellHeader`, `ConnectionStatus` |
| 5 | 3 kiểu heading (`font-[SVN-Gratelos_Display]` thô, `font-display`, `font-heading`) | Typography lệch nhau từng trang | ✓ gộp về `font-display` (38 chỗ) |
| 6 | Dead CSS: `.hide-mobile` family, `.bottom-nav`, `.score-pulse`, `.accent-dot`, hack `.lg\:grid-cols-2`; file chết `PublicHeader`, `GameHeader` | CSS phình, gây hiểu nhầm | ✓ xóa |
| 7 | Overlay OBS set `body background` nhưng quên `body::before` | Ảnh brand lòe sau overlay OBS | ✓ `useOverlayMode()` + `body.overlay-mode` |
| 8 | Màu accent mỗi surface hardcode (`orange-400`, `success`, `red-600`…) | Không kiểm soát được, lệch token | ✓ role tokens |
| 9 | Auth: lỗi chỉ là `text-xs` đỏ, input 32px, placeholder-only label | Lỗi khó thấy, touch target nhỏ | ✓ `AuthError` (role=alert), input 44px, aria-label |

---

## 2. Kiến trúc token (sau redesign)

```mermaid
flowchart TD
    subgraph GLOBAL["index.css — nguồn duy nhất"]
        BRAND["Brand: #4416d9 primary · #12102e bg · #ffb547 secondary · #9c8dfa link/accent"]
        SURFACE["Surface: #1b1552 card/popover · #241a66 muted · border white/10"]
        ROLE["Role accents:<br/>admin #9c8dfa · controller #ffb547<br/>qauthor #34d399 · mc #38bdf8 · live #fb7185"]
        A11Y["A11Y: focus-visible ring · reduced-motion<br/>scrim nền ảnh · cursor:pointer · line-height 1.5"]
    end

    BRAND --> SHADCN["shadcn semantic vars<br/>(background/card/primary/muted/...)"]
    SURFACE --> SHADCN
    ROLE --> RCLASS["Tailwind class:<br/>text-role-admin / bg-role-controller/20 ..."]
    A11Y --> BASE["@layer base — mọi trang miễn phí"]

    SHADCN --> PAGES["components/ui/* (button, card, input, ...)"]
    RCLASS --> SIDEBARS["4 sidebar shell"]
    BASE --> PAGES
```

## 3. Layout system 9 surface

```mermaid
flowchart LR
    subgraph PUBLIC["Public"]
        PL["PublicLayout<br/>(sidebar + mobile header h-12)"]
    end
    subgraph SHELL["Operator shells — dùng chung 1 component"]
        SH["ShellHeader<br/>roleLabel + useAuth"]
        AS["AdminSidebar<br/>role-admin"]
        CS["ControllerSidebar<br/>role-controller"]
        QS["QAuthorSidebar<br/>role-qauthor"]
    end
    subgraph GAME["Game live"]
        HB["HeaderBar<br/>phaseLabel() + ConnectionStatus"]
        PBP["PBasePageLayout (player/MC)"]
        CNAV["CNavBar (controller)"]
    end
    subgraph OVL["OBS Overlay"]
        UOM["useOverlayMode()<br/>body.overlay-mode → nền trong suốt"]
    end

    AS --> SH
    CS --> SH
    QS --> SH
    HB --> PBP
    HB --> CNAV
```

## 4. Quy tắc thiết kế (áp dụng khi làm trang mới)

1. **Màu**: chỉ dùng token (`role-*`, `success/warning/destructive`, `text-foreground`). Không hardcode hex/Tailwind palette (`orange-600`, `slate-600`, `text-white`) — dùng `text-foreground` thay `text-white`.
2. **Typography**: body Inter 16px/1.5; tiêu đề lớn/hero = `font-display` (SVN-Gratelos); tiêu đề card = `font-heading`.
3. **Touch**: control ≥ 36px (button `default` h-9), input 44px (`authInputClass`), vùng bấm ≥ 44px trên tablet (`touch-target`).
4. **Responsive**: grid stat 3 cột giữ `grid-cols-3`; form 2 cột hạ `grid-cols-1 sm:grid-cols-2` khi có input to; table để component `<Table>` lo (đã có `overflow-x-auto`).
5. **Feedback**: lỗi form dùng `<AuthError>` (`role=alert`); nút async hiện label loading; kết nối WebSocket dùng `<ConnectionStatus>`.
6. **Overlay OBS**: mọi trang overlay PHẢI gọi `useOverlayMode()` (không tự `<style>` set background).

## 5. Kiểm chứng

- `pnpm typecheck` (turbo toàn repo): 10/10 pass
- `pnpm build` (apps/web): pass — `✓ built in 6.27s`
- `pnpm lint` (apps/web): **exit 0** — 0 lỗi, 3 warning exhaustive-deps cũ (BankTab + VeDich×2, không phải lỗi)
- Sweep contrast: 0 chỗ `text-white` còn lại; nút success/warning/info đổi sang `*-foreground` tương ứng
  (trắng trên xanh #16a34a chỉ 3.3:1, trắng trên amber 2.1:1 → đều fail WCAG)
- Visual: login + public shell kiểm tra bằng Chrome DevTools ở 375px và 1440px, không lỗi JS console (chỉ 401/500 do preview không có backend)

## 6. Tab "Câu hỏi trận" — tinh chỉnh (2026-10)

Quyết định: bỏ box Danh sách (thông tin chuyển vào card slot), bỏ nút Sửa/Xoá rời rạc,
chỉ giữ "Gỡ khỏi slot" — vì `POST /questions/pick` trả 409 khi slot đã có câu.

```mermaid
flowchart TD
    A[Chọn vòng: KĐ chung / ĐR / GM / BP / VĐ] --> B[Lưới slot]
    B -->|slot trống| C["Hint: tìm bank bên dưới"]
    B -->|slot đã có câu| D[Card slot: code + nội dung + đáp án]
    D -->|Gỡ khỏi slot| E[Confirm DELETE /questions/:match/:code]
    E --> F[slot trống → quay lại C]
    C --> G[Search bank đã duyệt status=approved]
    G -->|bấm Vào slot| H[POST /questions/pick]
    H -->|409 already filled| I[alert lỗi — phải gỡ trước]
    H -->|ok| B
    G -->|GM: Pick cả set| H
    J[Câu chưa xếp slot — hiển thị riêng] -.->|không sửa/xoá| J
```

Cũng trong lần này: tự tải câu hỏi khi mount (nếu có mã trận lưu sẵn), gộp 2 nút Tải/trùng
thành 1 (có trạng thái "Đang tải…"), thêm loading/empty state cho bank list, bỏ pills progress
trùng lặp ở box header (progress sống ở tabs vòng của zone Pick).

**Update 19:30 — layout 2 cột:** header row gộp `h1 + mã trận + Tải + Soạn câu` (bỏ box input
trống chiếm chỗ); vùng Pick chia 2 cột desktop: **trái** = vòng + lưới slot + detail slot + chưa xếp,
**phải** = "Bank đã duyệt · {slot}" + ô tìm + kết quả dạng card cuộn (`max-h-26rem`) + empty state
icon; stack 1 cột trên mobile, separator `border-l` chỉ ≥1024px.

**Update 20:11 — bỏ tabs, ma trận toàn cục:** vòng thi không còn ẩn sau tabs. Cột trái hiện đủ5 vòng
(KĐ chung/riêng, Giải mã, Bứt phá, Về đích) với progress từng vòng; mỗi slot là ô 48×44px có trạng thái
thẳng (viền dashed = trống, xanh = đã có, viền tím + ring = đang chọn) + legend. Click ô bất kỳ →
`setPickRound(roundOfSlot(slot))` → bank bên phải tự lọc đúng vòng của ô đó. `tileLabel` rút gọn
(KDR `1..6`, GM `KEY/H1..H8`, VD `20..50`).

## 7. Sidebar — shadcn Sidebar block (2026-10)

4 sidebar gộp về 1 component `ShellSidebar` theo block pattern (sidebar-01/07):

```mermaid
flowchart TD
    subgraph SB["ShellSidebar — mỗi shell 1 wrapper config"]
      H["SidebarHeader<br/>brand tile OLYMPIA CUSTOM + tên shell"]
      C["SidebarContent<br/>SidebarGroup + SidebarGroupLabel<br/>(Vận hành / Hệ thống, Soạn câu, Khám phá ...) "]
      F["SidebarFooter<br/>user card dropdown: tên + vai trò + Đăng xuất<br/>(Public: nút Đăng nhập)"]
      R[SidebarRail — bấm mép để thu gọn]
    end
    AS[AdminSidebar] --> SB
    CS[ControllerSidebar] --> SB
    QS[QAuthorSidebar] --> SB
    PS[PublicSidebar] --> SB
```

- Active state theo role token: `data-[active=true]:bg-role-*/15`
- User menu chuyển từ header xuống footer (header chỉ còn trigger + tên + chip vai trò — `ShellHeader`)
- Item `newTab` (admin → controller/qauthor) có title "Mở trong tab mới"

## 8. Form trong panel edit — chuẩn hoá (2026-10)

Nguồn chung: `components/shared/ui/form.tsx`

| Token | Class | Dùng cho |
|---|---|---|
| `FormField` | bọc shadcn `Field`/`FieldLabel`/`FieldDescription`/`FieldError` | mọi field trong SidePanel |
| `formLabelClass` | `text-xs font-medium text-brand` | label (+ `*` destructive khi required) |
| `formHintClass` | `text-xs text-muted-foreground` | dòng gợi ý dưới input |
| `formSectionClass` | `text-xs font-semibold uppercase tracking-wide text-muted-foreground` | tiêu đề nhóm ("Cơ bản", "Thời gian…") |
| `formInputClass` | `h-9` | Input/NativeSelect 36px, bỏ lớp `bg-background/60 …` tự viết |
| `FormSection` | wrapper `formSectionClass` | tiêu đề nhóm field |

Đã áp: EditBankSidebar, EditQuestionPanel, EditQualifierPanel, MatchQuestionCreatePanel,
EditMatchQuestionPanel, TournamentFormPanel, MatchScheduleForm, UserPanels,
QualifierManager, CScoreEditModal, QAuthorSetsPage + 14 input toolbar còn lại
(BankTab/MatchTab/QualifierTab/SetFillPanel/AdminAudit/...).

Cũ đã xoá: `const labelClass = "text-xs text-brand"`, `const inputClass = "px-3 py-2 …"`,
hint `text-xs text-primary -mt-2` (text-primary trên nền tối fail contrast → muted-foreground).

## 9. DataTable — mọi bảng dùng chung 1 component (2026-10)

`components/shared/data-table.tsx` — shadcn DataTable block trên `@tanstack/react-table` v9
(`tableFeatures` + `useTable` + `FlexRender`), features: **sort cột, pagination client/server,
loading/empty state**. Props: `columns/data/loading/emptyText/pageSize/serverPagination/
onRowClick/rowClassName/bare`.

```mermaid
flowchart LR
    A["Page định nghĩa columns<br/>(createDataTableColumns&lt;T&gt;())"] --> B[DataTable]
    B --> C["sort: click header"]
    B --> D["pagination client pageSize<br/>hoặc serverPagination page/pageCount"]
    B --> E["loading → 'Đang tải…'<br/>empty → emptyText"]
```

Đã convert 8 bảng: BankTab (serverPager), AdminBankReview (serverPager + row click chọn dòng),
AdminAudit/AdminUsers/AdminMcpTokens/AdminCheckpoints (clientPager), StandingsTable,
SetFillPanel (`bare` — bảng mini trong panel, sort tắt).

**RulesPage** tách khỏi DataTable: bảng luật đổi UI riêng — `PointMatrix` (card điểm theo hạng,
tone màu great/good/mid/low) + `DurationList` (timeline thời gian vòng, thanh tỉ lệ /60s).

## 10. InputGroup — 16 chỗ gộp ô nhập + addon/nút (2026-10)

`components/ui/input-group.tsx` (shadcn) thay 3 hack phổ biến:

| Pattern cũ | Pattern mới | Chỗ đã đổi |
|---|---|---|
| icon Search `absolute` + `pl-8` | `InputGroupAddon` leading | QuestionsCard, AdminGameManagingPage |
| prefix text `absolute` + `pl-8` | `InputGroupText` leading | MatchScheduleForm (`#1..4`), QualifierManager (`A/B/C/D`) |
| Input + nút Tìm/Tải tách rời | `InputGroupButton` inline-end | BankTab, MatchTab ×2, SetFillPanel, QualifierTab, ControllerOverview, CQualifierPage, MQualifierPage, AdminCheckpoints |

Quy tắc: group luôn `h-9` (khớp `formInputClass`); nút submit ở `align="inline-end"`;
nút phụ (Soạn câu, Vào live, quay lại) để NGOÀI group.

**Nút Tìm/Tải chuẩn hoá về `variant="default"`** — bỏ `bg-success`/`bg-purple`/`bg-role-controller`
tự viết (8 nút trong các InputGroup). Icon-only trong ô (vd AdminCheckpoints refresh) giữ ghost.

## 11. Tài liệu đọc thêm

- `design-system/olympia-custom/MASTER.md` — design system gốc (lưu ý: palette/font trong này đã cũ, code ghi đè)
- [WCAG 2.2 — Contrast (Minimum) 4.5:1](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- [Tailwind CSS v4 CSS-first theme](https://tailwindcss.com/docs/theme) — `@theme` / token trong `index.css`
- [shadcn/ui theming](https://ui.shadcn.com/docs/theming) — semantic vars (`--card`, `--muted`, `--ring`)
- [Base UI (Button/Sidebar primitives)](https://base-ui.com/) — component gốc của `components/ui/*`
- `apps/web/src/lib/gameMeta.ts`, `lib/seriesColors.ts`, `hooks/useOverlayMode.ts`, `components/layout/ShellHeader.tsx`, `components/auth/AuthFormBits.tsx` — các module nguồn chung mới
