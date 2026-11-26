'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PERMISSIONS, type MemberDto, type Paginated } from '@fitflow/shared';
import { Badge, Button, Card, Input, buttonVariants } from '@fitflow/ui';
import { api } from '@/lib/api-client';
import { formatDate, formatPhone } from '@/lib/format';
import { useCan } from '@/lib/use-me';

const PAGE_SIZE = 20;

export default function MembersPage() {
  const can = useCan();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (debounced) params.set('search', debounced);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['members', { page, search: debounced }],
    queryFn: () => api<Paginated<MemberDto>>(`/members?${params}`),
    placeholderData: keepPreviousData,
  });

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Members</h1>
          <p className="text-sm text-fg-muted">{data ? `${data.total} total` : ' '}</p>
        </div>
        {can(PERMISSIONS.MEMBERS_WRITE) && (
          <Link href="/members/new" className={buttonVariants()}>
            <Plus size={16} aria-hidden /> Add member
          </Link>
        )}
      </div>

      <div className="relative max-w-md">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-3 text-fg-muted"
          aria-hidden
        />
        <Input
          type="search"
          placeholder="Search name, phone, member code or email"
          aria-label="Search members"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wide text-fg-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Mobile</th>
              <th className="px-4 py-3 font-medium">Tags</th>
              <th className="px-4 py-3 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            {isPending && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-fg-muted">
                  Loading…
                </td>
              </tr>
            )}
            {isError && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-danger">
                  {error.message}
                </td>
              </tr>
            )}
            {data?.items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-fg-muted">
                  {debounced
                    ? 'No members match your search.'
                    : 'No members yet. Add your first member.'}
                </td>
              </tr>
            )}
            {data?.items.map((m) => (
              <tr key={m.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                <td className="px-4 py-3 font-mono text-xs">{m.memberCode}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/members/${m.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {m.fullName}
                  </Link>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{formatPhone(m.phone)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {m.tags.map((t) => (
                      <Badge key={t}>{t}</Badge>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-fg-muted">
                  {formatDate(m.joinedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {pages > 1 && (
        <div className="flex items-center justify-end gap-3 text-sm">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-fg-muted">
            Page {page} of {pages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
