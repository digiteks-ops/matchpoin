export function PageSkeleton({
  variant = "list",
}: {
  variant?: "list" | "detail" | "form" | "dashboard";
}) {
  return (
    <div className="container mx-auto space-y-6 px-4 py-8 sm:px-6" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <div className="h-7 w-52 animate-pulse rounded-lg bg-slate-200" />
        <div className="h-3 w-80 max-w-full animate-pulse rounded bg-slate-100" />
      </div>

      {variant === "dashboard" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-2xl border border-slate-100 bg-white" />
          ))}
        </div>
      ) : null}

      {variant === "form" ? (
        <div className="mx-auto max-w-2xl space-y-4 rounded-2xl border border-slate-100 bg-white p-6">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="h-10 animate-pulse rounded-lg bg-slate-100" />
          ))}
          <div className="h-11 w-40 animate-pulse rounded-lg bg-slate-200" />
        </div>
      ) : (
        <div
          className={
            variant === "detail"
              ? "grid gap-4 lg:grid-cols-[1.4fr_1fr]"
              : "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          }
        >
          {Array.from({ length: variant === "detail" ? 2 : 6 }, (_, index) => (
            <div
              key={index}
              className={
                variant === "detail"
                  ? "h-72 animate-pulse rounded-2xl border border-slate-100 bg-white"
                  : "h-40 animate-pulse rounded-2xl border border-slate-100 bg-white"
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
