import { QRCodeSVG } from "qrcode.react"
import { cn } from "cn"

interface QRCodeProps {
    value: string
    size?: number
    title?: string
    className?: string
}


export function QRCode({ value, size = 192, title = "QR code", className }: QRCodeProps) {
    return (
        <div className={cn("inline-block rounded-md bg-white p-3", className)}>
            <QRCodeSVG value={value} size={size} level="M" title={title} />
        </div>
    )
}