import React from 'react';
import type { Metadata } from 'next';
import { apiGet, ApiClientError, isRedirectError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { UsersView } from './UsersView';
import { ForbiddenState } from '@/components/ui/ForbiddenState';
import { ErrorState } from '@/components/ui/ErrorState';

type UserListItem = components['schemas']['UserListItem'];
type UnitSummary = components['schemas']['UnitSummary'];

export const metadata: Metadata = {
  title: 'Quản trị người dùng | MBF Risk Monitor',
  description: 'Quản trị danh sách người dùng và phân quyền hệ thống',
};

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  let users: UserListItem[] = [];
  let units: UnitSummary[] = [];
  let isForbidden = false;
  let fetchError: string | null = null;

  try {
    const [usersRes, unitsRes] = await Promise.all([
      apiGet<UserListItem[]>('/api/users'),
      apiGet<UnitSummary[]>('/api/units'),
    ]);
    users = usersRes;
    units = unitsRes;
  } catch (err) {
    if (isRedirectError(err)) {
      throw err;
    }
    if (
      (err instanceof ApiClientError && (err.statusCode === 403 || err.code === 'FORBIDDEN')) ||
      (err && typeof err === 'object' && ('statusCode' in err && (err as { statusCode: number }).statusCode === 403))
    ) {
      isForbidden = true;
    } else {
      fetchError = (err as Error)?.message || 'Không thể tải danh sách người dùng.';
    }
  }

  if (isForbidden) {
    return <ForbiddenState />;
  }

  if (fetchError) {
    return (
      <div className="py-8">
        <ErrorState
          title="Không thể tải dữ liệu"
          message={fetchError}
        />
      </div>
    );
  }

  return <UsersView initialUsers={users} units={units} />;
}
