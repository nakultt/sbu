export default function PageShell({
  title,
  subtitle,
  eyebrow,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="page-enter mx-auto w-full max-w-[1180px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand">{eyebrow}</p>}
          <h1 className="font-display text-2xl font-bold tracking-[-0.045em] text-ink sm:text-[2.15rem]">{title}</h1>
          {subtitle && <p className="mt-2 max-w-2xl text-sm leading-6 text-muted sm:text-[15px]">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="mt-6 sm:mt-8">{children}</div>
    </div>
  );
}
