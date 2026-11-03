import { useSearchParams } from "react-router-dom"
import { StageShell } from "@shared/deck/stage-shell"
import { Card, CardContent } from "@shared/ui/card"
import { PinDoor } from "@/components/pin-door"

/**
 * /join — the player's door (IN THE GAMEPLAY APP — players never enter the
 * portal): type the 6-char PIN (staff read it off the matches list or the match
 * page), see who is seated, tap YOUR name.
 *
 * Backend (modules/auth/join.ts): lookup resolves the match + seats; claim mints
 * the GAMEPLAY session for that seat (user decision: match code + pick your
 * name — no password anywhere in this flow). On success the player lands in
 * /s/:slug/matches/:id — the PlayerShell deck.
 *
 * Two decisions shape the frame, and the PIN itself lives in `components/pin-door`
 * so the deck's "session expired" gate can show the same field in place:
 *
 * 1. It is drawn INSIDE the deck's frame (StageShell), not as a page of its own:
 *    the first screen of the show should look like the deck it opens. It fills
 *    the viewport (`fullHeight`) because it is a FORM on a phone — a 16:9 canvas
 *    is a 219 px letterbox at 390 px wide, which clips the card.
 * 2. There is no submit step (see PinDoor).
 */
export function JoinPage() {
    const [params] = useSearchParams()
    // The backend sends a stale Google link here with a reason; `/join` is the door
    // that always works.
    const notice = params.get("notice")
    const next = params.get("next") ?? "/"

    return (
        <StageShell fullHeight>
            <div className="flex min-h-dvh items-center justify-center p-5">
                <Card className="w-full max-w-[30rem]">
                    <CardContent className="flex flex-col gap-5">
                        <div className="flex flex-col gap-1 text-center">
                            <h1 className="font-display text-2xl font-bold uppercase leading-none text-foreground">
                                Vào trận
                            </h1>
                            <p className="font-sans text-sm text-muted-foreground">
                                Nhập mã 6 ký tự ban điều hành đọc, rồi chọn tên của bạn.
                            </p>
                            {notice === "google-off" ? (
                                <p className="mt-1 font-sans text-sm text-amber-700">
                                    Đăng nhập Google chưa được cấu hình — dùng mã PIN của ban điều hành.
                                </p>
                            ) : null}
                        </div>

                        <PinDoor next={next} />
                    </CardContent>
                </Card>
            </div>
        </StageShell>
    )
}

