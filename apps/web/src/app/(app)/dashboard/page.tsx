'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { PERMISSIONS, type MemberDto, type Paginated } from '@fitflow/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@fitflow/ui';
import { api } from '@/lib/api-client';
import { formatDate, formatPhone } from '@/lib/format';
import { useCan, useMe } from '@/lib/use-me';

const NEXT_UP = [
  'Membership plans, renewals and freezes',
  'GST invoices, payments, dues and Razorpay links',
  'QR and manual check-in',
  'Enquiries with follow-ups',
  'WhatsApp and SMS reminders',
];

export default function DashboardPage() {
  const { data: me } = useMe();
  const can = useCan();
  const canSeeMembers = can(PERMISSIONS.MEMBERS_READ);

  const recent = useQuery({
    queryKey: ['members', { page: 1, pageSize: 5 }],
    queryFn: () => api<Paginated<MemberDto>>('/members?page=1&pageSize=5'),
    enabled: canSeeMembers,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome{me ? `, ${me.name.split(' ')[0]}` : ''}</h1>
        <p className="text-sm text-fg-muted">{me?.gymName}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <p className="text-sm text-fg-muted">Members</p>
            <p className="text-3xl font-semibold tabular-nums">
              {canSeeMembers ? (recent.data?.total ?? '–') : '–'}
            </p>
          </CardHeader>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Recently added</CardTitle>
          </CardHeader>
          <CardContent>
            {!canSeeMembers && (
              <p className="text-sm text-fg-muted">You don&apos;t have access to members.</p>
            )}
            {recent.data?.items.length === 0 && (
              <p className="text-sm text-fg-muted">
                No members yet.{' '}
                <Link href="/members/new" className="text-primary hover:underline">
                  Add the first one
                </Link>
                .
              </p>
            )}
            <ul className="divide-y divide-border">
              {recent.data?.items.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <Link
                    href={`/members/${m.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {m.fullName}
                  </Link>
                  <span className="text-fg-muted">{formatPhone(m.phone)}</span>
                  <span className="hidden text-fg-muted sm:inline">{formatDate(m.joinedAt)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Coming next</CardTitle>
          <p className="text-sm text-fg-muted">Modules planned for the front-desk release</p>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {NEXT_UP.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
