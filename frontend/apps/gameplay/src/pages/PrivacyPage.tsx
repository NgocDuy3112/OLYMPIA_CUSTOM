import { Link } from "react-router-dom"

/**
 * /privacy — what this system collects, why, and who can see it.
 *
 * Two audiences read a policy: the player about to allow a camera, and whoever is
 * legally responsible for the data. It is therefore written from the CODE, not from
 * a template: every row below is a table the backend actually keeps, and every "we
 * do not" is a thing this codebase genuinely does not do (no analytics, no ad
 * cookies, no video recording).
 *
 * REVIEW BEFORE PUBLISHING. The wording is a starting point for the organiser's
 * lawyer (Nghị định 13/2023/NĐ-CP on personal-data protection applies in Vietnam;
 * Google sign-in adds the Google API Services User Data Policy). The contact block
 * is a placeholder and MUST be filled in.
 */

const UPDATED = "03/11/2026"

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="flex flex-col gap-2">
            <h2 className="font-display text-lg font-bold text-foreground">{title}</h2>
            <div className="flex flex-col gap-2 font-sans text-sm leading-relaxed text-muted-foreground">
                {children}
            </div>
        </section>
    )
}

function Bullets({ items }: { items: Array<React.ReactNode> }) {
    return (
        <ul className="list-disc pl-5">
            {items.map((item, index) => (
                <li key={index}>{item}</li>
            ))}
        </ul>
    )
}

export function PrivacyPage() {
    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:py-10">
            <header className="flex flex-col gap-1">
                <h1 className="font-display text-2xl font-bold uppercase text-foreground">
                    Chính sách quyền riêng tư
                </h1>
                <p className="font-sans text-sm text-muted-foreground">Cập nhật lần cuối: {UPDATED}</p>
            </header>

            <div className="flex flex-col gap-6 pb-10">
                <Section title="1. Phạm vi">
                    <p>
                        Chính sách này áp dụng cho hệ thống thi đấu Olympia Custom dùng để tổ chức và
                        phát sóng các trận đấu: trang dành cho thí sinh (vào trận bằng mã PIN) và trang
                        dành cho khán giả. Bên vận hành giải — ban điều hành hoặc đơn vị tổ chức — là bên
                        quyết định dữ liệu nào được tạo ra trong giải của họ.
                    </p>
                </Section>

                <Section title="2. Dữ liệu chúng tôi lưu">
                    <Bullets
                        items={[
                            <>
                                <b>Danh tính khi vào trận</b>: tên hiển thị bạn chọn ở trang vào trận,
                                ghế bạn ngồi, thời điểm vào. Không cần mật khẩu, không cần email.
                            </>,
                            <>
                                <b>Email (không bắt buộc)</b>: chỉ có khi ban điều hành nhập, hoặc khi
                                bạn tự đăng nhập bằng Google. Email dùng để giữ lịch sử thi đấu của bạn
                                qua nhiều giải.
                            </>,
                            <>
                                <b>Dữ liệu thi đấu</b>: câu trả lời và đáp án bạn chọn, thời điểm nộp,
                                điểm, kết quả, thứ hạng, các điều chỉnh điểm của ban điều hành (kèm lý do).
                            </>,
                            <>
                                <b>Nhật ký vận hành</b>: thao tác của ban điều hành trên giải (mở trận,
                                bắt đầu vòng, chấm điểm) để đối chiếu khi có khiếu nại.
                            </>,
                            <>
                                <b>Nhật ký máy chủ</b>: thông tin kỹ thuật của yêu cầu (thời điểm, địa
                                chỉ IP, loại yêu cầu) dùng để chống lạm dụng và xử lý sự cố.
                            </>,
                        ]}
                    />
                </Section>

                <Section title="3. Camera và micro">
                    <p>
                        Camera/micro chỉ được dùng khi bạn vào trận với tư cách thí sinh. Trình duyệt
                        sẽ hỏi quyền trước, và bạn có thể từ chối — khi đó bạn vẫn thi đấu được, chỉ là
                        không có hình.
                    </p>
                    <Bullets
                        items={[
                            <>
                                <b>Ai xem được</b>: ban điều hành của giải, các thí sinh cùng trận, và
                                khán giả của giải (nếu ban tổ chức mở phần xem công khai). Người khác
                                không vào được phòng của trận.
                            </>,
                            <>
                                <b>Chúng tôi không ghi âm, không ghi hình</b>. Hình và tiếng được truyền
                                trực tiếp trong phòng của trận; khi bạn rời trận, luồng đó kết thúc.
                            </>,
                            <>
                                <b>Bạn tắt được bất cứ lúc nào</b>: nút micro/camera trên màn hình thi
                                đấu, hoặc thu hồi quyền trong cài đặt trình duyệt.
                            </>,
                            <>
                                <b>Máy chủ truyền hình</b> do ban tổ chức tự vận hành (LiveKit), không
                                phải dịch vụ bên thứ ba.
                            </>,
                        ]}
                    />
                </Section>

                <Section title="4. Cookie và phiên đăng nhập">
                    <p>
                        Hệ thống chỉ dùng cookie cần thiết để giữ phiên của bạn (cookie không đọc được
                        bằng JavaScript, hết hạn sau một khoảng thời gian, chỉ gửi tới đúng tên miền của
                        giải). Không có cookie quảng cáo, không có mã theo dõi của bên thứ ba, không có
                        công cụ phân tích hành vi.
                    </p>
                </Section>

                <Section title="5. Mục đích và căn cứ xử lý">
                    <Bullets
                        items={[
                            "Tổ chức, điều hành và phát sóng trận đấu; tính điểm và xếp hạng.",
                            "Xác định bạn là ai trong trận để gán câu trả lời và điểm cho đúng người.",
                            "Giữ lịch sử thi đấu của bạn qua các giải (khi có email).",
                            "Chống lạm dụng và xử lý sự cố kỹ thuật.",
                        ]}
                    />
                    <p>
                        Căn cứ: sự đồng ý của bạn khi vào trận và khi cho phép camera/micro, và việc
                        thực hiện hoạt động tổ chức giải mà bạn tham gia.
                    </p>
                </Section>

                <Section title="6. Chia sẻ với ai">
                    <Bullets
                        items={[
                            <>
                                <b>Ban điều hành và ban tổ chức giải</b> — những người trực tiếp vận
                                hành trận của bạn.
                            </>,
                            <>
                                <b>Khán giả</b> — chỉ phần công khai của giải: bảng điểm, kết quả, và
                                hình ảnh nếu ban tổ chức mở xem.
                            </>,
                            <>
                                <b>Google</b> — chỉ khi bạn chọn đăng nhập bằng Google: hệ thống nhận
                                tên, email và ảnh đại diện từ tài khoản Google của bạn. Không có dữ liệu
                                nào khác được gửi cho Google, và dữ liệu nhận được không dùng cho mục
                                đích nào khác ngoài việc nhận diện bạn.
                            </>,
                        ]}
                    />
                    <p>Chúng tôi không bán, không cho thuê và không trao đổi dữ liệu cá nhân.</p>
                </Section>

                <Section title="7. Lưu trong bao lâu">
                    <Bullets
                        items={[
                            "Dữ liệu thi đấu (câu trả lời, điểm, kết quả) được giữ cùng với giải, vì đó là biên bản của kỳ thi.",
                            "Tài khoản thí sinh chỉ chơi tại chỗ (không email) chỉ tồn tại trong phạm vi giải đó.",
                            "Hình và tiếng không được lưu trên máy chủ của chúng tôi.",
                            "Nhật ký máy chủ được giữ trong thời gian cần thiết để điều tra sự cố.",
                        ]}
                    />
                </Section>

                <Section title="8. Quyền của bạn">
                    <Bullets
                        items={[
                            "Biết dữ liệu nào đang được lưu về mình.",
                            "Yêu cầu sửa tên hiển thị hoặc email (ban điều hành sửa trực tiếp trong tab Thí sinh).",
                            "Từ chối hoặc thu hồi quyền camera/micro bất cứ lúc nào.",
                            "Yêu cầu xoá khỏi danh sách thí sinh khi chưa thi đấu.",
                            "Khiếu nại về việc xử lý dữ liệu với ban tổ chức.",
                        ]}
                    />
                    <p>
                        Lưu ý: sau khi bạn đã thi đấu, kết quả của bạn là một phần biên bản của giải nên
                        không thể xoá riêng lẻ — hệ thống chặn việc xoá thí sinh đã có kết quả.
                    </p>
                </Section>

                <Section title="9. Bảo mật">
                    <p>
                        Phiên đăng nhập dùng cookie không đọc được bằng JavaScript; mật khẩu của ban
                        điều hành được băm (Argon2) và đăng nhập có xác thực hai lớp; mỗi yêu cầu được
                        kiểm tra quyền theo vai trò trong giải. Không có hệ thống nào an toàn tuyệt đối —
                        nếu bạn phát hiện lỗ hổng, hãy báo cho ban tổ chức.
                    </p>
                </Section>

                <Section title="10. Thí sinh dưới 18 tuổi">
                    <p>
                        Giải có thể có thí sinh chưa thành niên. Với thí sinh dưới 18 tuổi, ban tổ chức
                        cần có sự đồng ý của cha mẹ hoặc người giám hộ trước khi bật camera/micro, và
                        thí sinh có thể chọn không bật hình.
                    </p>
                </Section>

                <Section title="11. Thay đổi chính sách">
                    <p>
                        Khi chính sách thay đổi, ngày “cập nhật lần cuối” ở trên sẽ đổi. Thay đổi quan
                        trọng sẽ được ban tổ chức thông báo trước khi áp dụng cho giải đang diễn ra.
                    </p>
                </Section>

                <Section title="12. Liên hệ">
                    <p>
                        Mọi câu hỏi hoặc yêu cầu về dữ liệu cá nhân, liên hệ ban tổ chức giải của bạn
                        (thông tin liên hệ do ban tổ chức công bố cùng thể lệ giải). Bạn cũng có thể hỏi
                        trực tiếp ban điều hành trong lúc giải đang diễn ra.
                    </p>
                </Section>

                <p className="border-t pt-4 text-sm text-muted-foreground">
                    Xem thêm{" "}
                    <Link to="/" className="underline underline-offset-4 hover:text-foreground">
                        lịch thi đấu và thể lệ giải
                    </Link>
                    .
                </p>
            </div>
        </div>
    )
}
