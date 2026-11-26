'use client';

import {
  BarChart3,
  CalendarCheck,
  CreditCard,
  Dumbbell,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Settings,
  Ticket,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { PERMISSIONS, type Permission } from '@fitflow/shared';
import { Button, cn } from '@fitflow/ui';
import { useCan, useMe } from '@/lib/use-me';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission?: Permission;
  /** Module not built yet: shown so the roadmap is visible, but disabled. */
  soon?: boolean;
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/members', label: 'Members', icon: Users, permission: PERMISSIONS.MEMBERS_READ },
  { href: '/plans', label: 'Plans & renewals', icon: Ticket, soon: true },
  { href: '/billing', label: 'Billing', icon: CreditCard, soon: true },
  { href: '/attendance', label: 'Attendance', icon: CalendarCheck, soon: true },
  { href: '/enquiries', label: 'Enquiries', icon: MessageSquare, soon: true },
  { href: '/reports', label: 'Reports', icon: BarChart3, soon: true },
  { href: '/settings', label: 'Settings', icon: Settings, soon: true },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: me } = useMe();
  const can = useCan();
  const [open, setOpen] = useState(false);

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  };

  const nav = (
    <nav className="flex flex-col gap-1 p-3" aria-label="Main">
      {NAV.filter((item) => !item.permission || can(item.permission)).map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        if (item.soon) {
          return (
            <span
              key={item.href}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-fg-muted/70"
              title="Coming soon"
            >
              <Icon size={18} aria-hidden />
              {item.label}
              <span className="ml-auto text-[10px] uppercase tracking-wide">soon</span>
            </span>
          );
        }
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium',
              active ? 'bg-primary/10 text-primary' : 'text-fg hover:bg-muted',
            )}
          >
            <Icon size={18} aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r border-border bg-surface md:block">
        <div className="flex h-14 items-center gap-2 border-b border-border px-4 font-semibold">
          <Dumbbell size={20} className="text-primary" aria-hidden />
          FitFlow
        </div>
        {nav}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-border bg-surface px-4">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <Menu size={20} />
          </Button>
          <div className="min-w-0 flex-1 truncate font-medium">{me?.gymName ?? ''}</div>
          <div className="hidden text-right text-sm sm:block">
            <div className="font-medium">{me?.name}</div>
            <div className="text-xs text-fg-muted">{me?.roleKey?.toLowerCase()}</div>
          </div>
          <Button variant="ghost" size="icon" aria-label="Log out" title="Log out" onClick={logout}>
            <LogOut size={18} />
          </Button>
        </header>

        {open && <div className="border-b border-border bg-surface md:hidden">{nav}</div>}

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
