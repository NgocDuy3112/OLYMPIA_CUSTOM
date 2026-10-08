import { Link } from "react-router-dom"
import { Compass } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"

export function NotFoundPage() {
    return (
        <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
            <Compass className="size-10 text-muted-foreground" aria-hidden />
            <h1 className="font-heading text-2xl font-bold">
                Không tìm thấy trang
            </h1>
            <p className="text-sm text-muted-foreground">
                Đường dẫn bạn truy cập không tồn tại.
            </p>
            <Link
                to="/"
                className={buttonVariants({ variant: "outline", size: "sm" })}
            >
                Về trang lịch thi đấu
            </Link>
        </div>
    )
}