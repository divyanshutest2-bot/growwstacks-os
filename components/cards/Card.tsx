// Card — shared chrome for the universal module cards. Token-backed surface.
export function Card({
  title,
  testId,
  action,
  children,
}: {
  title: string;
  testId: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      data-testid={testId}
      className="flex flex-col gap-4 rounded-lg border border-border-subtle bg-surface p-6 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-display text-h3 font-bold tracking-tight text-ink">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}
