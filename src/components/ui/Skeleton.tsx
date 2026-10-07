export interface SkeletonProps {
  className?: string;
}

/** Bloco de carregamento (nunca tela em branco). */
export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-[var(--radius-sm)] bg-bg-hover ${className}`}
      aria-hidden="true"
    />
  );
}

/** Skeleton estrutural do app no carregamento inicial. */
export function AppSkeleton() {
  return (
    <div
      className="flex h-[100dvh] w-full overflow-hidden bg-bg-app"
      role="status"
      aria-label="Carregando"
    >
      <div className="flex w-60 flex-col gap-3 border-r border-border bg-bg-sidebar p-3">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <div className="mt-auto flex flex-col gap-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
      <div className="flex-1 p-8">
        <div className="flex flex-col gap-4 pt-6">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-9 w-64" />
        </div>
      </div>
      <div className="flex w-[420px] flex-col gap-4 border-l border-border bg-bg-editor p-6">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}
