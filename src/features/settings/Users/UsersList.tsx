import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { KeyRound, Pencil, Plus, Search, UserMinus, Users as UsersIcon } from 'lucide-react';
import { useState } from 'react';

import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusPill } from '@/components/common/StatusPill';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { usePermission, useCurrentUser } from '@/hooks/data/useAuth';
import { useRoles } from '@/hooks/data/useRoles';
import { useDeactivateUser, useUsers } from '@/hooks/data/useUsers';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

import { ResetPasswordDialog } from './ResetPasswordDialog';
import { UserEditor } from './UserEditor';

import type { Column, SortState } from '@/components/common/DataTable';
import type { UserPayload } from '@shared/types';

dayjs.extend(relativeTime);

/**
 * The accounts list.
 *
 * Two columns exist because of questions this system gets asked constantly and the retail app
 * cannot answer: **what can this person actually do** (the effective permission count, roles
 * unioned with their individual overrides, resolved server-side) and **where** (their
 * locations, or "all" for an unrestricted account).
 *
 * Deactivated users are listed, not hidden. They still appear as `createdBy` on documents, and
 * a list that silently drops them makes "who posted this" unanswerable from the UI.
 */
export function UsersList() {
  const me = useCurrentUser();
  const canCreate = usePermission('user:create');
  const canUpdate = usePermission('user:update');
  const canReset = usePermission('user:resetPassword');
  const canDelete = usePermission('user:delete');
  const canReadRoles = usePermission('role:read');

  const [search, setSearch] = useState('');
  const [roleId, setRoleId] = useState('');
  const [activeFilter, setActiveFilter] = useState<'' | 'true' | 'false'>('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [sort, setSort] = useState<SortState>({ field: 'name', order: 'asc' });

  const [editing, setEditing] = useState<UserPayload | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [resetting, setResetting] = useState<UserPayload | null>(null);
  const [deactivating, setDeactivating] = useState<UserPayload | null>(null);

  /**
   * Bumped on every open of the editor or the reset dialog, and used as their `key`.
   *
   * Both stay mounted while they close, so their exit animation can run; the counter is what
   * tells React the next open is a new session and the form should start from the props again.
   * It matters most for the reset dialog — a typed password must not survive a close.
   */
  const [dialogSession, setDialogSession] = useState(0);
  const newSession = () => setDialogSession((n) => n + 1);

  const q = useDebouncedValue(search);
  const deactivateUser = useDeactivateUser();
  const { data: rolesPage } = useRoles(canReadRoles ? { limit: 200 } : {});

  const { data, isLoading, isFetching } = useUsers({
    page,
    limit,
    q: q || undefined,
    sort: sort.field,
    order: sort.order,
    roleId: roleId || undefined,
    isActive: activeFilter === '' ? undefined : activeFilter === 'true',
  });

  const openEditor = (user: UserPayload | null) => {
    setEditing(user);
    newSession();
    setEditorOpen(true);
  };

  const openReset = (user: UserPayload) => {
    setResetting(user);
    newSession();
  };

  /** Any filter change resets to page 1 — see the note in RolesList. */
  const resetPage = () => setPage(1);

  const columns: Column<UserPayload>[] = [
    {
      key: 'name',
      header: 'User',
      sortable: true,
      cell: (user) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
      ),
    },
    {
      key: 'roleCodes',
      header: 'Roles',
      cell: (user) => (
        <div className="flex flex-wrap gap-1">
          {user.roleCodes.length === 0 ? (
            <span className="text-xs text-muted-foreground">none</span>
          ) : (
            user.roleCodes.map((code) => (
              <Badge key={code} variant="secondary" className="font-mono text-[10px]">
                {code}
              </Badge>
            ))
          )}
        </div>
      ),
    },
    {
      key: 'effectivePermissions',
      header: 'Can do',
      cell: (user) => {
        const overrides = user.permissionGrants.length + user.permissionRevokes.length;
        return (
          <span className="whitespace-nowrap text-sm">
            <span className="tabular-nums">{user.effectivePermissions.length}</span>
            <span className="text-muted-foreground"> permissions</span>
            {overrides > 0 && (
              <Badge variant="warning" className="ml-1.5 px-1.5 py-0 text-[10px]">
                {overrides} override{overrides === 1 ? '' : 's'}
              </Badge>
            )}
          </span>
        );
      },
    },
    {
      key: 'locationIds',
      header: 'Locations',
      cell: (user) =>
        user.locationIds.length === 0 ? (
          // Empty means unrestricted — the single most misread field on this screen, so it is
          // spelled out rather than shown as "0".
          <span className="text-sm text-muted-foreground">All</span>
        ) : (
          <span className="text-sm tabular-nums">{user.locationIds.length}</span>
        ),
    },
    {
      key: 'lastLoginAt',
      header: 'Last seen',
      sortable: true,
      cell: (user) => (
        <span
          className="whitespace-nowrap text-sm text-muted-foreground"
          title={
            user.lastLoginAt ? dayjs(user.lastLoginAt).format('D MMM YYYY, HH:mm') : undefined
          }
        >
          {user.lastLoginAt ? dayjs(user.lastLoginAt).fromNow() : 'Never'}
        </span>
      ),
    },
    {
      key: 'isActive',
      header: 'Status',
      cell: (user) => <StatusPill status={user.isActive ? 'ACTIVE' : 'INACTIVE'} />,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      headClassName: 'text-right',
      cell: (user) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => openEditor(user)}
            aria-label={canUpdate ? `Edit ${user.name}` : `View ${user.name}`}
            title={canUpdate ? 'Edit' : 'View'}
          >
            <Pencil />
          </Button>

          {canReset && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => openReset(user)}
              aria-label={`Reset ${user.name}'s password`}
              title="Reset password"
            >
              <KeyRound />
            </Button>
          )}

          {canDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:bg-destructive/10"
              // The server refuses this too — deactivating yourself locks you out of the
              // screen you would need to undo it.
              disabled={!user.isActive || user.id === me?.id}
              title={
                user.id === me?.id
                  ? 'You cannot deactivate your own account'
                  : !user.isActive
                    ? 'Already deactivated'
                    : 'Deactivate'
              }
              onClick={() => setDeactivating(user)}
              aria-label={`Deactivate ${user.name}`}
            >
              <UserMinus />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const filtered = Boolean(q || roleId || activeFilter);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Users"
        icon={UsersIcon}
        description="Accounts, the roles they hold, and the locations they may work in."
        actions={
          canCreate && (
            <Button onClick={() => openEditor(null)}>
              <Plus aria-hidden="true" />
              New user
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1 sm:max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
            placeholder="Search name or email…"
            className="pl-9"
            aria-label="Search users"
          />
        </div>

        {canReadRoles && (
          <Select
            value={roleId}
            onChange={(e) => {
              setRoleId(e.target.value);
              resetPage();
            }}
            className="w-44"
            aria-label="Filter by role"
          >
            <option value="">All roles</option>
            {(rolesPage?.items ?? []).map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </Select>
        )}

        <Select
          value={activeFilter}
          onChange={(e) => {
            setActiveFilter(e.target.value as '' | 'true' | 'false');
            resetPage();
          }}
          className="w-36"
          aria-label="Filter by status"
        >
          <option value="">Any status</option>
          <option value="true">Active</option>
          <option value="false">Deactivated</option>
        </Select>
      </div>

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(user) => user.id}
        isLoading={isLoading}
        isFetching={isFetching}
        meta={data?.meta}
        onPageChange={setPage}
        onLimitChange={(next) => {
          setLimit(next);
          resetPage();
        }}
        sort={sort}
        onSortChange={setSort}
        onRowClick={openEditor}
        empty={
          filtered ? (
            <EmptyState
              icon={Search}
              title="No user matches these filters"
              description="Nothing here is wrong — the filters simply exclude everyone."
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch('');
                    setRoleId('');
                    setActiveFilter('');
                    resetPage();
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={UsersIcon}
              title="No users yet"
              description="Run the server's seed to create the administrator account."
            />
          )
        }
      />

      <UserEditor
        key={`editor-${dialogSession}`}
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        user={editing}
      />

      <ResetPasswordDialog
        key={`reset-${dialogSession}`}
        open={resetting !== null}
        onClose={() => setResetting(null)}
        user={resetting}
      />

      <ConfirmDialog
        open={deactivating !== null}
        onClose={() => setDeactivating(null)}
        onConfirm={() =>
          deactivating &&
          deactivateUser.mutate(deactivating.id, { onSuccess: () => setDeactivating(null) })
        }
        title="Deactivate this account?"
        description={
          <>
            <strong>{deactivating?.name}</strong> will be signed out immediately and will not be
            able to sign back in. Nothing they posted is affected — the account is kept so that
            every document still says who created it. You can reactivate it later.
          </>
        }
        confirmLabel="Deactivate"
        destructive
        pending={deactivateUser.isPending}
      />
    </div>
  );
}
