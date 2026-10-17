import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Settings } from "lucide-react";


interface ScheduleHeaderProps {
    title?: string
    dayLabel?: string
    onPrevDay?: () => void
    onNextDay?: () => void
    onToday?: () => void
    onSettings?: () => void
}


export function ScheduleHeader({
    title = "Sớm Nay",
    dayLabel = "Hôm nay",
    onPrevDay,
    onNextDay,
    onToday,
    onSettings,
}: ScheduleHeaderProps) {
    return (
        <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-6">
            <h1 className="font-heading text-2xl font-bold md:text-3xl">{title}</h1>
            <div className="flex items-center gap-2">
                {/* date navigation pill */}
                <div className="flex items-center overflow-hidden rounded-lg bg-secondary">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-none"
                        aria-label="Previous day"
                        onClick={onPrevDay}
                    >
                        <ArrowLeft />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-none px-3"
                        onClick={onToday}
                    >
                        {dayLabel}
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-none"
                        aria-label="Next day"
                        onClick={onNextDay}
                    >
                        <ArrowRight />
                    </Button>
                </div>


                {/* settings */}
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Settings"
                    onClick={onSettings}
                >
                    <Settings />
                </Button>
            </div>
        </header>
    )
}