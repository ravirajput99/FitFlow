'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { PERMISSIONS, type MemberDto } from '@fitflow/shared';
import { Button } from '@fitflow/ui';
import { MemberForm } from '@/components/member-form';
import { api, apiJson } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { useCan } from '@/lib/use-me';

export default function MemberPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const can = useCan();
  const [saved, setSaved] = useState(false);

  const {
    data: member,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ['member', id],
    queryFn: () => api<MemberDto>(`/members/${id}`),
  });

  const remove = useMutation({
    mutationFn: () => api<void>(`/members/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      router.push('/members');
    },
  });

  if (isPending) return <p className="text-fg-muted">Loading…</p>;
  if (isError) return <p className="text-danger">{error.message}</p>;

  const canEdit = can(PERMISSIONS.MEMBERS_WRITE);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/members" className="text-sm text-fg-muted hover:underline">
            ← Members
          </Link>
          <h1 className="text-2xl font-semibold">{member.fullName}</h1>
          <p className="text-sm text-fg-muted">
            <span className="font-mono">{member.memberCode}</span> · joined{' '}
            {formatDate(member.joinedAt)}
          </p>
        </div>
        {can(PERMISSIONS.MEMBERS_DELETE) && (
          <Button
            variant="secondary"
            className="text-danger"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm(`Remove ${member.fullName}? Their history is kept.`))
                remove.mutate();
            }}
          >
            <Trash2 size={16} aria-hidden /> Remove
          </Button>
        )}
      </div>

      {remove.isError && <p className="text-sm text-danger">{remove.error.message}</p>}
      {saved && (
        <p role="status" className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
          Changes saved.
        </p>
      )}

      {canEdit ? (
        <MemberForm
          key={member.updatedAt}
          member={member}
          submitLabel="Save changes"
          onSubmit={async (values) => {
            setSaved(false);
            const updated = await api<MemberDto>(`/members/${id}`, apiJson('PATCH', values));
            queryClient.setQueryData(['member', id], updated);
            await queryClient.invalidateQueries({ queryKey: ['members'] });
            setSaved(true);
          }}
        />
      ) : (
        <p className="text-sm text-fg-muted">You can view this member but not edit them.</p>
      )}
    </div>
  );
}
