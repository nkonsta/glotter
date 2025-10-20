'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';

type MemberRecord = {
  id: string;
  userId: string;
  email: string | null;
  role: string;
  createdAt?: string | null;
  lastSignInAt?: string | null;
  emailConfirmedAt?: string | null;
};

type ManageProjectMembersDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
  projectName?: string | null;
  accessToken: string | null;
};

const ROLE_OPTIONS = [
  {
    value: 'editor' as const,
    label: 'Editor',
    helper: 'Editors can add and modify translations.',
  },
  {
    value: 'viewer' as const,
    label: 'Viewer',
    helper: 'Viewers have read-only access to translations.',
  },
];

export default function ManageProjectMembersDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  accessToken,
}: ManageProjectMembersDialogProps) {
  const { toast } = useToast();
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('viewer');
  const [submitting, setSubmitting] = useState(false);
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);

  const editableRoleValues = useMemo<Array<'editor' | 'viewer'>>(() => ROLE_OPTIONS.map(option => option.value), []);
  const roleLabelMap = useMemo(
    () =>
      ({
        owner: 'Owner',
        editor: 'Editor',
        viewer: 'Viewer',
      }) as Record<string, string>,
    []
  );

  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      const emailA = a.email?.toLowerCase() ?? '';
      const emailB = b.email?.toLowerCase() ?? '';
      if (emailA && emailB) return emailA.localeCompare(emailB);
      if (emailA) return -1;
      if (emailB) return 1;
      return a.userId.localeCompare(b.userId);
    });
  }, [members]);

  const canSubmit = Boolean(email.trim()) && Boolean(projectId) && Boolean(accessToken);

  const fetchMembers = useCallback(async () => {
    if (!projectId || !accessToken) {
      setMembers([]);
      return;
    }

    setLoadingMembers(true);
    try {
      const response = await fetch(`/api/admin/project-members?projectId=${encodeURIComponent(projectId)}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        const message = typeof errorPayload.error === 'string' ? errorPayload.error : 'Failed to load members.';

        if (response.status === 401 || response.status === 403) {
          toast({ title: 'Access denied', description: message, variant: 'error' });
          onOpenChange(false);
          return;
        }

        throw new Error(message);
      }

      const payload = (await response.json()) as { members?: MemberRecord[] };
      setMembers(Array.isArray(payload.members) ? payload.members : []);
    } catch (error) {
      console.error('Failed to fetch project members', error);
      toast({
        title: 'Could not load members',
        description: error instanceof Error ? error.message : 'Something went wrong while loading members.',
        variant: 'error',
      });
      setMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  }, [projectId, accessToken, toast, onOpenChange]);

  useEffect(() => {
    if (open) {
      void fetchMembers();
    } else {
      setEmail('');
      setRole('viewer');
    }
  }, [open, fetchMembers]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!projectId || !accessToken || !email.trim()) {
        return;
      }

      setSubmitting(true);
      try {
        const response = await fetch('/api/admin/project-members', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            projectId,
            email,
            role,
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const description = typeof payload.error === 'string' ? payload.error : 'Could not add member.';
          toast({
            title: 'Failed to add member',
            description,
            variant: 'error',
          });
          if (response.status === 401 || response.status === 403) {
            onOpenChange(false);
          }
          return;
        }

        toast({
          title: 'Member added',
          description:
            payload.status === 'updated'
              ? 'Existing member role updated.'
              : payload.status === 'unchanged'
                ? 'User is already assigned with the same role.'
                : 'User invited to the project.',
          variant: 'success',
        });

        setEmail('');
        setRole('viewer');
        void fetchMembers();
      } catch (error) {
        console.error('Failed to add project member', error);
        toast({
          title: 'Failed to add member',
          description: error instanceof Error ? error.message : 'Unexpected error occurred.',
          variant: 'error',
        });
      } finally {
        setSubmitting(false);
      }
    },
    [accessToken, email, projectId, role, toast, fetchMembers, onOpenChange]
  );

  const handleRoleUpdate = useCallback(
    async (member: MemberRecord, nextRole: 'editor' | 'viewer') => {
      if (!projectId || !accessToken) return;
      if (member.role === nextRole) return;
      if (!member.email) {
        toast({
          title: 'Cannot update role',
          description: 'This member does not have an email address associated with their account.',
          variant: 'error',
        });
        return;
      }

      setUpdatingMemberId(member.id);
      try {
        const response = await fetch('/api/admin/project-members', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            projectId,
            email: member.email,
            role: nextRole,
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const description = typeof payload.error === 'string' ? payload.error : 'Could not update member role.';
          toast({ title: 'Failed to update role', description, variant: 'error' });
          if (response.status === 401 || response.status === 403) {
            onOpenChange(false);
          }
          return;
        }

        setMembers(prev =>
          prev.map(existing => (existing.id === member.id ? { ...existing, role: nextRole } : existing))
        );

        const status = typeof payload.status === 'string' ? payload.status : 'updated';
        toast({
          title: 'Role updated',
          description:
            status === 'unchanged'
              ? `${member.email} already has the ${roleLabelMap[nextRole] ?? nextRole} role.`
              : `Updated ${member.email} to ${roleLabelMap[nextRole] ?? nextRole}.`,
          variant: 'success',
        });
      } catch (error) {
        console.error('Failed to update member role', error);
        toast({
          title: 'Failed to update role',
          description: error instanceof Error ? error.message : 'Unexpected error occurred.',
          variant: 'error',
        });
      } finally {
        setUpdatingMemberId(null);
      }
    },
    [accessToken, onOpenChange, projectId, roleLabelMap, toast]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage project members</DialogTitle>
          <DialogDescription>
            Invite teammates to the {projectName ?? 'selected'} project and adjust their access levels.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-muted" htmlFor="member-email">
              Email address
            </label>
            <input
              id="member-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              placeholder="translator@example.com"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="space-y-2">
            <span className="block text-sm font-medium text-muted">Role</span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ROLE_OPTIONS.map((option) => {
                const active = role === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setRole(option.value)}
                    className={`
                      rounded-lg border px-3 py-2 text-left text-sm transition
                      ${active ? 'border-primary/60 bg-primary-soft text-foreground' : 'border-border bg-surface text-muted hover:border-border/80 hover:bg-surface-hover'}
                    `}
                  >
                    <span className="block font-medium text-foreground">{option.label}</span>
                    <span className="text-xs text-muted">{option.helper}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={!canSubmit || submitting}>
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner size={16} />
                  Inviting…
                </span>
              ) : (
                'Invite member'
              )}
            </Button>
          </div>
        </form>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Current members</h3>
            {loadingMembers && (
              <span className="inline-flex items-center gap-2 text-xs text-muted">
                <Spinner size={14} />
                Loading…
              </span>
            )}
          </div>

          {!loadingMembers && sortedMembers.length === 0 && (
            <p className="text-sm text-muted border border-dashed border-border rounded-lg px-3 py-4 text-center">
              No members found for this project yet. Invite someone above to get started.
            </p>
          )}

          {sortedMembers.length > 0 && (
            <ul className="space-y-2">
              {sortedMembers.map((member) => (
                <li
                  key={member.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      {member.email ?? member.userId}
                    </p>
                    <div className="flex items-center gap-2">
                      {editableRoleValues.includes(member.role as 'editor' | 'viewer') ? (
                        <select
                          value={member.role}
                          onChange={(event) => handleRoleUpdate(member, event.target.value as 'editor' | 'viewer')}
                          disabled={updatingMemberId === member.id}
                          className="text-xs bg-surface border border-border rounded-md px-2 py-1 text-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
                        >
                          {ROLE_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-muted">
                          Role: {roleLabelMap[member.role] ?? member.role}
                        </span>
                      )}
                      {updatingMemberId === member.id && <Spinner size={14} />}
                    </div>
                    {!member.emailConfirmedAt && (
                      <p className="text-xs text-warning">
                        Invitation pending — user has not confirmed their email yet.
                      </p>
                    )}
                  </div>
                  <div className="text-right text-xs text-muted">
                    {member.lastSignInAt ? (
                      <span>Last seen {new Date(member.lastSignInAt).toLocaleDateString()}</span>
                    ) : (
                      <span>Never signed in</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
