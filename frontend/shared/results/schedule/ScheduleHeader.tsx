import { PageHeader } from "@shared/results/PageHeader";
import { Button } from "@shared/ui/button";
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
        <PageHeader
            title={title}
            actions={
                <>
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

                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Settings"
                        onClick={onSettings}
                    >
                        <Settings />
                    </Button>
                </>
            }
        />
    )
}
