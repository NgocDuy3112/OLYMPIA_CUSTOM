import { Skeleton } from "../ui/skeleton";


export function CardSkeleton() {
    return (
        <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background/30 p-3.5">
            <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-4 w-2/3" />
            <div className="flex gap-1.5">
                <Skeleton className="h-4 w-12 rounded" />
                <Skeleton className="h-4 w-16 rounded" />
            </div>
        </div>
    )
}

export function CardSkeletonGrid({ count = 6 }: { count?: number }) {
    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: count }).map((_, i) => (
                <CardSkeleton key={i} />
            ))}
        </div>
    );
}