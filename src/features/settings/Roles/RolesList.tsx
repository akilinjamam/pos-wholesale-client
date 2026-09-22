import { Lock, Pencil, Plus, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePermission } from '@/hooks/data/useAuth';
import { useDeleteRole, useRoles } from '@/hooks/data/useRoles';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

import { RoleEditor } from './RoleEditor';

import type { Column, SortState } from '@/components/common/DataTable';
import type { RolePayload } from '@shared/types';

/**
 * Roles — what each one may do, and who holds it.
 *
 * The screen the Day-4 milestone is demonstrated from: edit a role's permissions here and the
 * holders' menus change on their next sign-in, because the server bumps their `tokenVersion`.
 *
 * Every action is gated twice — the button is hidden without the permission, *and* the server
 * refuses it. The hiding is a courtesy; the refusal is the control.
 */
export function RolesList() {
  const canCreate = usePermission('role:create');
  const canUpdate = usePermission('role:update');
  const canDelete = usePermission('role:delete');

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [sort, setSort] = useState<SortState>({ field: 'code', order: 'asc' });

  const [editing, setEditing] = useState<RolePayload | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  /**
   * Bumped on every open, and used as the editor's `key`.
   *
   * The editor stays mounted while it closes — otherwise its exit animation never runs — so a
   * counter is what tells React "this is a new editing session, start from the props again".
   * Keying on the role's id would not do: reopening the same role after cancelling would reuse
   * the abandoned edits.
   */
  const [editorSession, setEditorSession] = useState(0);
  const [deleting, setDeleting] = useState<RolePayload | null>(null);

  const q = useDebouncedValue(search);
  const deleteRole = useDeleteRole();

  const { data, isLoading, isFetching } = useRoles({
    page,
    limit,
    q: q || undefined,
    sort: sort.field,
    order: sort.order,
  });

  const openEditor = (role: RolePayload | null) => {
    setEditing(role);
    setEditorSession((n) => n + 1);
    setEditorOpen(true);
  };

  const columns: Column<RolePayload>[] = [
    {
      key: 'code',
      header: 'Code',
      sortable: true,
      cell: (role) => (
        <span className="flex items-center gap-2">
          <span className="font-mono text-xs font-medium">{role.code}</span>
          {role.isSystem && (
            <Badge variant="secondary" className="gap-1">
              <Lock className="h-3 w-3" aria-hidden="true" />
              system
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      cell: (role) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{role.name}</p>
          {role.description && (
            <p className="truncate text-xs text-muted-foreground">{role.description}</p>
          )}
        </div>
      ),
    },
    {
      key: 'permissions',
      header: 'Permissions',
      className: 'tabular-nums',
      cell: (role) => role.permissions.length,
    },
    {
      key: 'userCount',
      header: 'Users',
      className: 'tabular-nums',
      cell: (role) => role.userCount ?? 0,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      headClassName: 'text-right',
      cell: (role) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => openEditor(role)}
            aria-label={canUpdate ? `Edit ${role.name}` : `View ${role.name}`}
            title={canUpdate ? 'Edit' : 'View'}
          >
            <Pencil />
          </Button>

          {canDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:bg-destructive/10"
              // A system role cannot be deleted and neither can one somebody holds; the server
              // refuses both with a 409. Disabling here explains *why* before the click.
              disabled={role.isSystem || (role.userCount ?? 0) > 0}
              title={
                role.isSystem
                  ? 'System roles cannot be deleted — edit their permissions instead'
                  : (role.userCount ?? 0) > 0
                    ? 'Users still hold this role'
                    : 'Delete'
              }
              onClick={() => setDeleting(role)}
              aria-label={`Delete ${role.name}`}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Roles"
        icon={ShieldCheck}
        description="A role is a named set of permissions. Editing one takes effect on its holders' next request."
        actions={
          canCreate && (
            <Button onClick={() => openEditor(null)}>
              <Plus aria-hidden="true" />
              New role
            </Button>
          )
        }
      />

      <div className="relative max-w-sm">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            // Back to page 1: staying on page 3 of the old result set shows an empty table and
            // looks like "no matches" for a search that has plenty.
            setPage(1);
          }}
          placeholder="Search roles…"
          className="pl-9"
          aria-label="Search roles"
        />
      </div>

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(role) => role.id}
        isLoading={isLoading}
        isFetching={isFetching}
        meta={data?.meta}
        onPageChange={setPage}
        onLimitChange={(next) => {
          setLimit(next);
          setPage(1);
        }}
        sort={sort}
        onSortChange={setSort}
        onRowClick={openEditor}
        empty={
          q ? (
            <EmptyState
              icon={Search}
              title={`No role matches “${q}”`}
              description="Try a different code or name."
              action={
                <Button variant="outline" size="sm" onClick={() => setSearch('')}>
                  Clear search
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={ShieldCheck}
              title="No roles yet"
              description="Run the seed to create the seven system roles, or add one of your own."
            />
          )
        }
      />

      <RoleEditor
        key={editorSession}
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        role={editing}
      />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() =>
          deleting && deleteRole.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
        }
        title="Delete this role?"
        description={
          <>
            <strong>{deleting?.name}</strong> will be removed. This cannot be undone — but no
            user holds it, so nobody loses access.
          </>
        }
        confirmLabel="Delete role"
        destructive
        pending={deleteRole.isPending}
      />
    </div>
  );
}
