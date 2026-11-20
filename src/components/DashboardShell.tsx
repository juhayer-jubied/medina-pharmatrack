import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { PublicUser } from '../lib/pharmaLogic';

export interface SidebarNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  count?: number;
}

interface DashboardShellProps {
  user: PublicUser;
  roleLabel: string;
  roleIcon: LucideIcon;
  navItems: SidebarNavItem[];
  activeNavId: string;
  onSelectNav: (id: string) => void;
  title: string;
  subtitle: string;
  headerActions?: ReactNode;
  sidebarFooter?: ReactNode;
  children: ReactNode;
}

export function DashboardShell({
  user,
  roleLabel,
  roleIcon: RoleIcon,
  navItems,
  activeNavId,
  onSelectNav,
  title,
  subtitle,
  headerActions,
  sidebarFooter,
  children,
}: DashboardShellProps) {
  return (
    <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">
      {/* Left Sidebar Navigation */}
      <aside
        aria-label="Workspace navigation"
        className="w-full lg:w-64 shrink-0 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.06)] no-print lg:sticky lg:top-24"
      >
        {/* Role & Organization Identity */}
        <div className="border-b border-slate-100 pb-4 mb-3">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800 whitespace-nowrap">
              <RoleIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {roleLabel}
            </span>
            <span className="font-mono text-xs font-semibold text-slate-500">
              {user.entityId}
            </span>
          </div>
          <div className="mt-2.5 text-sm font-semibold tracking-tight text-slate-900 truncate">
            {user.organizationName}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 truncate">
            @{user.username}
            {user.area ? ` · ${user.area}` : ''}
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex lg:flex-col gap-1 overflow-x-auto pb-1 lg:pb-0">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.id === activeNavId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectNav(item.id)}
                className={`flex items-center justify-between gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-all whitespace-nowrap shrink-0 lg:w-full ${
                  active
                    ? 'bg-teal-50/90 text-[#0F766E] font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className="inline-flex items-center gap-2.5">
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      active ? 'text-[#0F766E]' : 'text-slate-400'
                    }`}
                    aria-hidden="true"
                  />
                  <span>{item.label}</span>
                </span>
                {typeof item.count === 'number' && (
                  <span
                    className={`font-mono text-xs tabular-nums ${
                      active ? 'text-[#0F766E]' : 'text-slate-400'
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {sidebarFooter && (
          <div className="hidden lg:block mt-4 border-t border-slate-100 pt-4 space-y-2">
            {sidebarFooter}
          </div>
        )}
      </aside>

      {/* Main Workspace Area */}
      <div className="min-w-0 flex-1 w-full space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 no-print">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
              {title}
            </h1>
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          </div>
          {headerActions && (
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {headerActions}
            </div>
          )}
        </div>

        {children}
      </div>
    </div>
  );
}
