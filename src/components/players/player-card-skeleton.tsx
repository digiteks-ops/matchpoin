import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function PlayerCardSkeleton() {
  return (
    <Card className="border-slate-200/90 flex flex-col justify-between overflow-hidden">
      <div>
        <CardHeader className="p-4 pb-3 flex flex-row items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Skeleton className="w-12 h-12 rounded-full" />
            <div className="space-y-1.5">
              <Skeleton className="w-28 h-4" />
              <Skeleton className="w-20 h-3" />
            </div>
          </div>
          <Skeleton className="w-14 h-7 rounded-lg" />
        </CardHeader>

        <CardContent className="p-4 pt-1 space-y-3">
          <Skeleton className="w-full h-8 rounded" />
          <div className="flex gap-2">
            <Skeleton className="w-16 h-5 rounded-full" />
            <Skeleton className="w-20 h-5 rounded-full" />
          </div>
          <Skeleton className="w-full h-12 rounded-lg" />
        </CardContent>
      </div>

      <div className="p-4 pt-0 grid grid-cols-2 gap-2">
        <Skeleton className="w-full h-8 rounded-lg" />
        <Skeleton className="w-full h-8 rounded-lg" />
      </div>
    </Card>
  );
}
