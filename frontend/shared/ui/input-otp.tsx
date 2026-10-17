import { OTPInput, OTPInputContext } from "input-otp"
import { useContext, type ComponentProps } from "react"
import { cn } from "cn"

export function InputOTP({
    className,
    containerClassName,
    ...props
}: ComponentProps<typeof OTPInput>) {
    return (
        <OTPInput
            data-slot="input-otp"
            containerClassName={cn("flex items-center gap-2", containerClassName)}
            className={cn("disabled:cursor-not-allowed", className)}
            {...props}
        />
    )
}

export function InputOTPGroup({ className, ...props }: ComponentProps<"div">) {
    return (
        <div
            data-slot="input-otp-group"
            className={cn("flex items-center", className)}
            {...props}
        />
    )
}

export function InputOTPSlot({
    index,
    className,
    ...props
}: ComponentProps<"div"> & { index: number }) {
    const { slots } = useContext(OTPInputContext)
    const slot = slots[index]

    return (
        <div
            data-slot="input-otp-slot"
            data-active={slot?.isActive}
            className={cn(
                "relative flex h-10 w-10 items-center justify-center border-y border-r border-input text-sm first:rounded-l-md first:border-l last:rounded-r-md",
                slot?.isActive && "z-10 ring-2 ring-ring",
                className,
            )}
            {...props}
        >
            {slot?.char}
            {slot?.hasFakeCaret && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="h-4 w-px bg-foreground" />
                </div>
            )}
        </div>
    )
}