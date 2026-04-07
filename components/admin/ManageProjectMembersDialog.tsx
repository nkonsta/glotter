'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';

type ProjectRole = 'owner' | 'member';

type MemberRecord = {
  id: string;
  userId: string;
  email: string | null;
  role: ProjectRole;
  viewLanguages: string[] | null;
  editLanguages: string[] | null;
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
  availableLanguages: Array<{ code: string; name: string | null }>;
};

const ROLE_OPTIONS: Array<{ value: ProjectRole; label: string; helper: string }> = [
  {
    value: 'owner',
    label: 'Owner',
    helper: 'Full project control. Access to all languages and management tools.',
  },
  {
    value: 'member',
    label: 'Member',
    helper: 'Customize view/edit languages per collaborator.',
  },
];

function normalizeMember(payload: MemberRecord): MemberRecord {
  return {
    ...payload,
    viewLanguages: Array.isArray(payload.viewLanguages) ? payload.viewLanguages : null,
    editLanguages: Array.isArray(payload.editLanguages) ? payload.editLanguages : null,
  };
}

function languageLabel(code: string, name: string | null | undefined) {
  if (!code) return '';
  const upper = code.toUpperCase();
  return name ? `${upper} (${name})` : upper;
}

export default function ManageProjectMembersDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  accessToken,
  availableLanguages,
}: ManageProjectMembersDialogProps) {
  const { toast } = useToast();
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ProjectRole>('member');
  const [viewSelection, setViewSelection] = useState<Set<string>>(new Set());
  const [editSelection, setEditSelection] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [confirmRemoveMemberId, setConfirmRemoveMemberId] = useState<string | null>(null);
  const [editingMember, setEditingMember] = useState<MemberRecord | null>(null);
  const [editRole, setEditRole] = useState<ProjectRole>('member');
  const [editViewSelection, setEditViewSelection] = useState<Set<string>>(new Set());
  const [editEditSelection, setEditEditSelection] = useState<Set<string>>(new Set());

  const languagesByCode = useMemo(() => {
    const map = new Map<string, string | null>();
    availableLanguages.forEach((lang) => {
      map.set(lang.code, lang.name ?? null);
    });
    return map;
  }, [availableLanguages]);

  const defaultViewSeed = useCallback(() => {
    if (availableLanguages.length === 0) {
      return new Set<string>();
    }
    const english = availableLanguages.find((lang) => lang.code.toLowerCase() === 'en');
    if (english) {
      return new Set<string>([english.code]);
    }
    return new Set<string>([availableLanguages[0].code]);
  }, [availableLanguages]);

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

  const canSubmit = useMemo(() => {
    if (!projectId || !accessToken || !email.trim()) return false;
    if (role === 'owner') return true;
    if (availableLanguages.length === 0) return false;
    if (viewSelection.size === 0) return false;
    for (const code of editSelection) {
      if (!viewSelection.has(code)) return false;
    }
    return true;
  }, [projectId, accessToken, email, role, availableLanguages.length, viewSelection, editSelection]);

  const canSaveEdit = useMemo(() => {
    if (!editingMember || !projectId || !accessToken) return false;
    if (editRole === 'owner') return true;
    if (availableLanguages.length === 0) return false;
    if (editViewSelection.size === 0) return false;
    for (const code of editEditSelection) {
      if (!editViewSelection.has(code)) return false;
    }
    return true;
  }, [editingMember, projectId, accessToken, editRole, availableLanguages.length, editViewSelection, editEditSelection]);

  const formatLanguageList = useCallback(
    (codes: string[] | null) => {
      if (!codes || codes.length === 0) return 'None';
      return codes
        .map((code) => languageLabel(code, languagesByCode.get(code)))
        .join(', ');
    },
    [languagesByCode]
  );

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
      const nextMembers = Array.isArray(payload.members) ? payload.members.map(normalizeMember) : [];
      setMembers(nextMembers);
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
      setEmail('');
      setRole('member');
      setViewSelection(defaultViewSeed());
      setEditSelection(new Set());
    } else {
      setEmail('');
      setRole('member');
      setViewSelection(defaultViewSeed());
      setEditSelection(new Set());
      setEditingMember(null);
      setConfirmRemoveMemberId(null);
    }
  }, [open, fetchMembers, defaultViewSeed]);

  const toggleViewLanguage = useCallback((code: string) => {
    setViewSelection((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
        setEditSelection((prevEdit) => {
          if (!prevEdit.has(code)) return prevEdit;
          const updated = new Set(prevEdit);
          updated.delete(code);
          return updated;
        });
      } else {
        next.add(code);
      }
      return next;
    });
  }, []);

  const toggleEditLanguage = useCallback((code: string) => {
    setEditSelection((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  }, []);

  const toggleEditViewLanguage = useCallback((code: string) => {
    setEditViewSelection((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
        setEditEditSelection((prevEdit) => {
          if (!prevEdit.has(code)) return prevEdit;
          const updated = new Set(prevEdit);
          updated.delete(code);
          return updated;
        });
      } else {
        next.add(code);
      }
      return next;
    });
  }, []);

  const toggleEditEditableLanguage = useCallback((code: string) => {
    setEditEditSelection((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!projectId || !accessToken || !email.trim()) {
        return;
      }

      if (role === 'member' && viewSelection.size === 0) {
        toast({ title: 'Add at least one language', description: 'Members need at least one visible language.', variant: 'error' });
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
            viewLanguages: role === 'member' ? Array.from(viewSelection) : null,
            editLanguages: role === 'member' ? Array.from(editSelection) : null,
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
          title: 'User added',
          description:
            payload.status === 'updated'
              ? 'Existing member access updated.'
              : payload.status === 'unchanged'
                ? 'User already has the same access.'
                : 'User added successfully.',
          variant: 'success',
        });

        setEmail('');
        setRole('member');
        setViewSelection(defaultViewSeed());
        setEditSelection(new Set());
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
    [projectId, accessToken, email, role, viewSelection, editSelection, toast, onOpenChange, defaultViewSeed, fetchMembers]
  );

  const startEditingMember = useCallback(
    (member: MemberRecord) => {
      if (!member.email) {
        toast({
          title: 'Cannot edit member',
          description: 'This member does not have an email address associated with their account.',
          variant: 'error',
        });
        return;
      }

      setEditingMember(member);
      setEditRole(member.role);
      if (member.role === 'member') {
        setEditViewSelection(new Set(member.viewLanguages ?? []));
        setEditEditSelection(new Set(member.editLanguages ?? []));
      } else {
        setEditViewSelection(defaultViewSeed());
        setEditEditSelection(new Set());
      }
    },
    [toast, defaultViewSeed]
  );

  const handleUpdateMember = useCallback(async () => {
    if (!editingMember || !projectId || !accessToken || !editingMember.email) {
      return;
    }

    if (editRole === 'member' && editViewSelection.size === 0) {
      toast({
        title: 'Add at least one language',
        description: 'Members need at least one visible language.',
        variant: 'error',
      });
      return;
    }

    setUpdatingMemberId(editingMember.id);
    try {
      const response = await fetch('/api/admin/project-members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          projectId,
          email: editingMember.email,
          role: editRole,
          viewLanguages: editRole === 'member' ? Array.from(editViewSelection) : null,
          editLanguages: editRole === 'member' ? Array.from(editEditSelection) : null,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const description = typeof payload.error === 'string' ? payload.error : 'Could not update member access.';
        toast({ title: 'Failed to update member', description, variant: 'error' });
        if (response.status === 401 || response.status === 403) {
          onOpenChange(false);
        }
        return;
      }

      toast({
        title: 'Access updated',
        description:
          payload.status === 'unchanged'
            ? `${editingMember.email} already has the same access.`
            : `Updated permissions for ${editingMember.email}.`,
        variant: 'success',
      });

      setEditingMember(null);
      setEditRole('member');
      setEditViewSelection(defaultViewSeed());
      setEditEditSelection(new Set());
      void fetchMembers();
    } catch (error) {
      console.error('Failed to update member access', error);
      toast({
        title: 'Failed to update member',
        description: error instanceof Error ? error.message : 'Unexpected error occurred.',
        variant: 'error',
      });
    } finally {
      setUpdatingMemberId(null);
    }
  }, [editingMember, projectId, accessToken, editRole, editViewSelection, editEditSelection, toast, onOpenChange, defaultViewSeed, fetchMembers]);

  const handleRemoveMember = useCallback(
    async (member: MemberRecord) => {
      if (!projectId || !accessToken) return;

      setRemovingMemberId(member.id);
      setConfirmRemoveMemberId(null);
      try {
        const response = await fetch('/api/admin/project-members', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ projectId, userId: member.userId }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const description = typeof payload.error === 'string' ? payload.error : 'Could not remove member.';
          toast({ title: 'Failed to remove member', description, variant: 'error' });
          if (response.status === 401 || response.status === 403) {
            onOpenChange(false);
          }
          return;
        }

        setMembers((prev) => prev.filter((m) => m.id !== member.id));
        toast({
          title: 'Member removed',
          description: `${member.email ?? member.userId} has been removed from this project.`,
          variant: 'success',
        });
      } catch (error) {
        console.error('Failed to remove project member', error);
        toast({
          title: 'Failed to remove member',
          description: error instanceof Error ? error.message : 'Unexpected error occurred.',
          variant: 'error',
        });
      } finally {
        setRemovingMemberId(null);
      }
    },
    [projectId, accessToken, toast, onOpenChange]
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
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
                      onClick={() => {
                        setRole(option.value);
                        if (option.value === 'member' && viewSelection.size === 0) {
                          setViewSelection(defaultViewSeed());
                        }
                      }}
                      className={`
                        rounded-lg border px-3 py-2 text-left text-sm transition
                        ${
                          active
                            ? 'border-primary/60 bg-primary-soft text-foreground'
                            : 'border-border bg-surface text-muted hover:border-border/80 hover:bg-surface-hover'
                        }
                      `}
                    >
                      <span className="block font-medium text-foreground">{option.label}</span>
                      <span className="text-xs text-muted">{option.helper}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {role === 'member' && (
              <div className="space-y-3">
                <div>
                  <span className="block text-sm font-medium text-muted">View languages</span>
                  {availableLanguages.length === 0 ? (
                    <p className="mt-1 text-xs text-warning">
                      Add project languages before inviting members with restricted access.
                    </p>
                  ) : (
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {availableLanguages.map((lang) => {
                        const checked = viewSelection.has(lang.code);
                        return (
                          <label key={lang.code} className="flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleViewLanguage(lang.code)}
                              className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                            />
                            <span>{languageLabel(lang.code, lang.name)}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <span className="block text-sm font-medium text-muted">Edit languages</span>
                  <p className="mt-1 text-xs text-muted">
                    Editors must first have view access. Leave unchecked for read-only.
                  </p>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {Array.from(viewSelection).map((code) => {
                      const lang = languagesByCode.get(code) ?? null;
                      const checked = editSelection.has(code);
                      return (
                        <label key={code} className="flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleEditLanguage(code)}
                            className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                          />
                          <span>{languageLabel(code, lang)}</span>
                        </label>
                      );
                    })}
                    {viewSelection.size === 0 && (
                      <p className="col-span-full text-xs text-muted">Select view languages to enable editing access.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={!canSubmit || submitting}>
                {submitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner size={16} />
                    Adding…
                  </span>
                ) : (
                  'Add user'
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
                    className="flex flex-col gap-3 rounded-lg border border-border bg-surface px-3 py-2 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">{member.email ?? member.userId}</p>
                      <p className="text-xs text-muted">Role: {member.role === 'owner' ? 'Owner' : 'Member'}</p>
                      {member.role === 'member' && (
                        <div className="space-y-0.5 text-xs text-muted">
                          <p>View: {formatLanguageList(member.viewLanguages)}</p>
                          <p>Edit: {formatLanguageList(member.editLanguages)}</p>
                        </div>
                      )}
                      {!member.emailConfirmedAt && (
                        <p className="text-xs text-warning">Invitation pending — user has not confirmed their email yet.</p>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                      <div className="text-right text-xs text-muted">
                        {member.lastSignInAt ? (
                          <span>Last seen {new Date(member.lastSignInAt).toLocaleDateString()}</span>
                        ) : (
                          <span>Never signed in</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {confirmRemoveMemberId === member.id ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setConfirmRemoveMemberId(null)}
                              disabled={removingMemberId === member.id}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => void handleRemoveMember(member)}
                              disabled={removingMemberId === member.id}
                            >
                              {removingMemberId === member.id ? (
                                <span className="inline-flex items-center gap-2">
                                  <Spinner size={14} />
                                  Removing…
                                </span>
                              ) : (
                                'Confirm remove'
                              )}
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => startEditingMember(member)}
                              disabled={updatingMemberId === member.id || removingMemberId === member.id}
                            >
                              {updatingMemberId === member.id ? (
                                <span className="inline-flex items-center gap-2">
                                  <Spinner size={14} />
                                  Updating…
                                </span>
                              ) : (
                                'Edit access'
                              )}
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => setConfirmRemoveMemberId(member.id)}
                              disabled={updatingMemberId === member.id || removingMemberId === member.id}
                            >
                              Remove
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingMember)} onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setEditingMember(null);
          setEditRole('member');
          setEditViewSelection(defaultViewSeed());
          setEditEditSelection(new Set());
        }
      }}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit member access</DialogTitle>
            <DialogDescription>
              Adjust role and language permissions for {editingMember?.email ?? 'this member'}.
            </DialogDescription>
          </DialogHeader>

          {editingMember && (
            <div className="space-y-4">
              <div>
                <span className="block text-sm font-medium text-muted">Email</span>
                <p className="mt-1 text-sm text-foreground">{editingMember.email ?? editingMember.userId}</p>
              </div>

              <div className="space-y-2">
                <span className="block text-sm font-medium text-muted">Role</span>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {ROLE_OPTIONS.map((option) => {
                    const active = editRole === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setEditRole(option.value);
                          if (option.value === 'member' && editViewSelection.size === 0) {
                            setEditViewSelection(defaultViewSeed());
                          }
                        }}
                        className={`
                          rounded-lg border px-3 py-2 text-left text-sm transition
                          ${
                            active
                              ? 'border-primary/60 bg-primary-soft text-foreground'
                              : 'border-border bg-surface text-muted hover:border-border/80 hover:bg-surface-hover'
                          }
                        `}
                      >
                        <span className="block font-medium text-foreground">{option.label}</span>
                        <span className="text-xs text-muted">{option.helper}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {editRole === 'member' && (
                <div className="space-y-3">
                  <div>
                    <span className="block text-sm font-medium text-muted">View languages</span>
                    {availableLanguages.length === 0 ? (
                      <p className="mt-1 text-xs text-warning">
                        Add project languages before assigning restricted access.
                      </p>
                    ) : (
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {availableLanguages.map((lang) => {
                          const checked = editViewSelection.has(lang.code);
                          return (
                            <label key={lang.code} className="flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleEditViewLanguage(lang.code)}
                                className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                              />
                              <span>{languageLabel(lang.code, lang.name)}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div>
                    <span className="block text-sm font-medium text-muted">Edit languages</span>
                    <p className="mt-1 text-xs text-muted">Editors must first have view access.</p>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {Array.from(editViewSelection).map((code) => {
                        const lang = languagesByCode.get(code) ?? null;
                        const checked = editEditSelection.has(code);
                        return (
                          <label key={code} className="flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleEditEditableLanguage(code)}
                              className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                            />
                            <span>{languageLabel(code, lang)}</span>
                          </label>
                        );
                      })}
                      {editViewSelection.size === 0 && (
                        <p className="col-span-full text-xs text-muted">Select view languages to enable editing access.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingMember(null);
                    setEditRole('member');
                    setEditViewSelection(defaultViewSeed());
                    setEditEditSelection(new Set());
                  }}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={handleUpdateMember} disabled={!canSaveEdit || updatingMemberId === editingMember.id}>
                  {updatingMemberId === editingMember.id ? (
                    <span className="inline-flex items-center gap-2">
                      <Spinner size={16} />
                      Saving…
                    </span>
                  ) : (
                    'Save changes'
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
