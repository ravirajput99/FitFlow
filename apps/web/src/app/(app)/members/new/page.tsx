'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MemberDto } from '@fitflow/shared';
import { MemberForm } from '@/components/member-form';
import { api, apiJson } from '@/lib/api-client';

export default function NewMemberPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/members" className="text-sm text-fg-muted hover:underline">
          ← Members
        </Link>
        <h1 className="text-2xl font-semibold">Add member</h1>
      </div>
      <MemberForm
        submitLabel="Add member"
        onSubmit={async (values) => {
          const member = await api<MemberDto>('/members', apiJson('POST', values));
          await queryClient.invalidateQueries({ queryKey: ['members'] });
          router.push(`/members/${member.id}`);
        }}
      />
    </div>
  );
}
