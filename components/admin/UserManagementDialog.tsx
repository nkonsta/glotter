'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Eye, EyeOff } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';

type ProjectRole = 'owner' | 'member';

type ProjectAssignment = {
  id: string;
  projectId: string;
  projectName: string;
  role: ProjectRole;
  viewLanguages: string[] | null;
  editLanguages: string[] | null;
  createdAt: string;
};

type UserRecord = {
  id: string;
  email: string | null;
  displayName: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
  isPlatformAdmin: boolean;
  assignments: ProjectAssignment[];
};

type DirectoryProject = {
  id: string;
  name: string;
  languages: Array<{ code: string; name: string | null }>;
};

type AssignmentDraft = {
  userId: string;
  projectId: string;
  role: ProjectRole;
  viewLanguages: Set<string>;
  editLanguages: Set<string>;
};

type AdminConfirmation = {
  userId: string;
  action: 'grant' | 'revoke';
};

type UserManagementDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accessToken: string | null;
  currentUserId: string | null;
};

function accountLabel(user: UserRecord) {
  return user.displayName ?? user.email ?? user.id;
}

function formatLanguages(codes: string[] | null) {
  if (!codes || codes.length === 0) return 'None';
  return codes.map((code) => code.toUpperCase()).join(', ');
}

export default function UserManagementDialog({
  open,
  onOpenChange,
  accessToken,
  currentUserId,
}: UserManagementDialogProps) {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [projects, setProjects] = useState<DirectoryProject[]>([]);
  const [loadingDirectory, setLoadingDirectory] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [showCreateUser, setShowCreateUser] = useState(false);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [adminConfirmation, setAdminConfirmation] = useState<AdminConfirmation | null>(null);
  const [removeMemberships, setRemoveMemberships] = useState(false);
  const [updatingAdminUserId, setUpdatingAdminUserId] = useState<string | null>(null);

  const [assignmentDraft, setAssignmentDraft] = useState<AssignmentDraft | null>(null);
  const [assigningProjectAccess, setAssigningProjectAccess] = useState(false);
  const [recoveryProjectId, setRecoveryProjectId] = useState<string | null>(null);
  const [recoveryUserId, setRecoveryUserId] = useState('');
  const [recoveringProject, setRecoveringProject] = useState(false);

  const fetchDirectory = useCallback(async () => {
    if (!accessToken) return;

    setLoadingDirectory(true);
    try {
      const response = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = typeof payload.error === 'string' ? payload.error : 'Failed to load users and access.';
        if (response.status === 401 || response.status === 403) {
          toast({ title: 'Access denied', description: message, variant: 'error' });
          onOpenChange(false);
          return;
        }
        throw new Error(message);
      }

      const payload = (await response.json()) as {
        users?: UserRecord[];
        projects?: DirectoryProject[];
      };
      const sortedUsers = (Array.isArray(payload.users) ? payload.users : []).sort((a, b) => {
        const aLabel = (a.email ?? accountLabel(a)).toLowerCase();
        const bLabel = (b.email ?? accountLabel(b)).toLowerCase();
        return aLabel.localeCompare(bLabel);
      });
      setUsers(sortedUsers);
      setProjects(Array.isArray(payload.projects) ? payload.projects : []);
    } catch (error) {
      console.error('Failed to fetch access directory', error);
      toast({
        title: 'Could not load users and access',
        description: error instanceof Error ? error.message : 'Something went wrong.',
        variant: 'error',
      });
    } finally {
      setLoadingDirectory(false);
    }
  }, [accessToken, toast, onOpenChange]);

  useEffect(() => {
    if (open) {
      void fetchDirectory();
    }
    setSearchQuery('');
    setShowCreateUser(false);
    setEmail('');
    setDisplayName('');
    setPassword('');
    setShowPassword(false);
    setConfirmDeleteUserId(null);
    setAdminConfirmation(null);
    setRemoveMemberships(false);
    setAssignmentDraft(null);
    setRecoveryProjectId(null);
    setRecoveryUserId('');
  }, [open, fetchDirectory]);

  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

  const projectMembers = useMemo(() => {
    const result = new Map<string, Array<{ user: UserRecord; assignment: ProjectAssignment }>>();
    for (const user of users) {
      for (const assignment of user.assignments) {
        const current = result.get(assignment.projectId) ?? [];
        current.push({ user, assignment });
        result.set(assignment.projectId, current);
      }
    }
    return result;
  }, [users]);

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) => {
      return (
        accountLabel(user).toLowerCase().includes(query) ||
        (user.email?.toLowerCase().includes(query) ?? false) ||
        user.assignments.some((assignment) => assignment.projectName.toLowerCase().includes(query))
      );
    });
  }, [users, searchQuery]);

  const filteredProjects = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter((project) => {
      const members = projectMembers.get(project.id) ?? [];
      return (
        project.name.toLowerCase().includes(query) ||
        members.some(({ user }) => {
          return accountLabel(user).toLowerCase().includes(query) || (user.email?.toLowerCase().includes(query) ?? false);
        })
      );
    });
  }, [projects, projectMembers, searchQuery]);

  const nonAdminUsers = useMemo(() => users.filter((user) => !user.isPlatformAdmin), [users]);

  const selectedAssignmentProject = useMemo(() => {
    if (!assignmentDraft) return null;
    return projects.find((project) => project.id === assignmentDraft.projectId) ?? null;
  }, [assignmentDraft, projects]);

  const handleCreateUser = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!accessToken || !email.trim() || !password) return;

      setSubmitting(true);
      try {
        const response = await fetch('/api/admin/users', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ email: email.trim(), password, displayName: displayName.trim() || undefined }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const description = typeof payload.error === 'string' ? payload.error : 'Could not create user.';
          toast({ title: 'Failed to create user', description, variant: 'error' });
          return;
        }

        const createdUserId = typeof payload.user?.id === 'string' ? payload.user.id : null;
        const firstProject = projects[0] ?? null;
        toast({
          title: 'User created',
          description: firstProject && createdUserId
            ? `${displayName.trim() || email.trim()} can sign in. Now choose their project role and editable languages.`
            : !firstProject
              ? `${displayName.trim() || email.trim()} can sign in, but there are no projects available to assign yet.`
              : `${displayName.trim() || email.trim()} can sign in. Use Add project access below to finish setup.`,
          variant: 'success',
        });
        setEmail('');
        setDisplayName('');
        setPassword('');
        setShowCreateUser(false);
        setSearchQuery('');
        if (firstProject && createdUserId) {
          const firstLanguage = firstProject.languages[0]?.code;
          setAssignmentDraft({
            userId: createdUserId,
            projectId: firstProject.id,
            role: 'member',
            viewLanguages: new Set(firstLanguage ? [firstLanguage] : []),
            editLanguages: new Set(),
          });
        }
        await fetchDirectory();
      } catch (error) {
        console.error('Failed to create user', error);
        toast({
          title: 'Failed to create user',
          description: error instanceof Error ? error.message : 'Unexpected error occurred.',
          variant: 'error',
        });
      } finally {
        setSubmitting(false);
      }
    },
    [accessToken, email, displayName, password, projects, toast, fetchDirectory]
  );

  const handleDeleteUser = useCallback(
    async (user: UserRecord) => {
      if (!accessToken) return;

      setDeletingUserId(user.id);
      setConfirmDeleteUserId(null);
      try {
        const response = await fetch('/api/admin/users', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ userId: user.id }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const description = typeof payload.error === 'string' ? payload.error : 'Could not delete user.';
          toast({ title: 'Failed to delete user account', description, variant: 'error' });
          return;
        }

        toast({
          title: 'User account deleted',
          description: `${user.email ?? user.id} has been permanently deleted.`,
          variant: 'success',
        });
        await fetchDirectory();
      } catch (error) {
        console.error('Failed to delete user', error);
        toast({
          title: 'Failed to delete user account',
          description: error instanceof Error ? error.message : 'Unexpected error occurred.',
          variant: 'error',
        });
      } finally {
        setDeletingUserId(null);
      }
    },
    [accessToken, toast, fetchDirectory]
  );

  const handleAdminAccess = useCallback(async () => {
    if (!accessToken || !adminConfirmation) return;
    const user = usersById.get(adminConfirmation.userId);
    if (!user) return;

    const granting = adminConfirmation.action === 'grant';
    setUpdatingAdminUserId(user.id);
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          userId: user.id,
          isPlatformAdmin: granting,
          removeProjectMemberships: !granting && removeMemberships,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const description = typeof payload.error === 'string' ? payload.error : 'Could not update admin access.';
        toast({ title: 'Failed to update access', description, variant: 'error' });
        return;
      }

      toast({
        title: granting ? 'Admin access granted' : 'Admin access revoked',
        description: granting
          ? `${accountLabel(user)} now has global access.`
          : removeMemberships
            ? `${accountLabel(user)} no longer has platform or project access.`
            : `${accountLabel(user)} now uses their retained project assignments.`,
        variant: 'success',
      });
      setAdminConfirmation(null);
      setRemoveMemberships(false);
      await fetchDirectory();
    } catch (error) {
      console.error('Failed to update platform-admin access', error);
      toast({
        title: 'Failed to update access',
        description: error instanceof Error ? error.message : 'Unexpected error occurred.',
        variant: 'error',
      });
    } finally {
      setUpdatingAdminUserId(null);
    }
  }, [accessToken, adminConfirmation, usersById, removeMemberships, toast, fetchDirectory]);

  const startAssignment = useCallback((user: UserRecord) => {
    const assignedProjectIds = new Set(user.assignments.map((assignment) => assignment.projectId));
    const project = projects.find((candidate) => !assignedProjectIds.has(candidate.id));
    if (!project) {
      toast({
        title: 'No projects available',
        description: 'This account already has an assignment for every project.',
        variant: 'info',
      });
      return;
    }

    const firstLanguage = project.languages[0]?.code;
    setAssignmentDraft({
      userId: user.id,
      projectId: project.id,
      role: 'member',
      viewLanguages: new Set(firstLanguage ? [firstLanguage] : []),
      editLanguages: new Set(),
    });
  }, [projects, toast]);

  const selectAssignmentProject = useCallback((projectId: string) => {
    const project = projects.find((candidate) => candidate.id === projectId) ?? null;
    const firstLanguage = project?.languages[0]?.code;
    setAssignmentDraft((current) => current ? {
      ...current,
      projectId,
      viewLanguages: new Set(firstLanguage ? [firstLanguage] : []),
      editLanguages: new Set(),
    } : null);
  }, [projects]);

  const toggleViewLanguage = useCallback((code: string) => {
    setAssignmentDraft((current) => {
      if (!current) return null;
      const viewLanguages = new Set(current.viewLanguages);
      const editLanguages = new Set(current.editLanguages);
      if (viewLanguages.has(code)) {
        viewLanguages.delete(code);
        editLanguages.delete(code);
      } else {
        viewLanguages.add(code);
      }
      return { ...current, viewLanguages, editLanguages };
    });
  }, []);

  const toggleEditLanguage = useCallback((code: string) => {
    setAssignmentDraft((current) => {
      if (!current || !current.viewLanguages.has(code)) return current;
      const editLanguages = new Set(current.editLanguages);
      if (editLanguages.has(code)) editLanguages.delete(code);
      else editLanguages.add(code);
      return { ...current, editLanguages };
    });
  }, []);

  const submitAssignment = useCallback(async () => {
    if (!accessToken || !assignmentDraft) return;
    const user = usersById.get(assignmentDraft.userId);
    if (!user) return;

    setAssigningProjectAccess(true);
    try {
      const response = await fetch('/api/admin/project-members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          projectId: assignmentDraft.projectId,
          userId: assignmentDraft.userId,
          role: assignmentDraft.role,
          viewLanguages: assignmentDraft.role === 'member' ? Array.from(assignmentDraft.viewLanguages) : null,
          editLanguages: assignmentDraft.role === 'member' ? Array.from(assignmentDraft.editLanguages) : null,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const description = typeof payload.error === 'string' ? payload.error : 'Could not assign project access.';
        toast({ title: 'Failed to assign access', description, variant: 'error' });
        return;
      }

      const project = projects.find((candidate) => candidate.id === assignmentDraft.projectId);
      toast({
        title: 'Project access assigned',
        description: assignmentDraft.role === 'owner'
          ? `${accountLabel(user)} is now an owner of ${project?.name ?? 'the project'} with full project control.`
          : assignmentDraft.editLanguages.size > 0
            ? `${accountLabel(user)} can view ${formatLanguages(Array.from(assignmentDraft.viewLanguages))} and edit ${formatLanguages(Array.from(assignmentDraft.editLanguages))} in ${project?.name ?? 'the project'}.`
            : `${accountLabel(user)} has read-only access to ${formatLanguages(Array.from(assignmentDraft.viewLanguages))} in ${project?.name ?? 'the project'}.`,
        variant: 'success',
      });
      setAssignmentDraft(null);
      await fetchDirectory();
    } catch (error) {
      console.error('Failed to assign project access', error);
      toast({
        title: 'Failed to assign access',
        description: error instanceof Error ? error.message : 'Unexpected error occurred.',
        variant: 'error',
      });
    } finally {
      setAssigningProjectAccess(false);
    }
  }, [accessToken, assignmentDraft, usersById, projects, toast, fetchDirectory]);

  const recoverOwnerlessProject = useCallback(async () => {
    if (!accessToken || !recoveryProjectId || !recoveryUserId) return;
    const project = projects.find((candidate) => candidate.id === recoveryProjectId);
    const user = usersById.get(recoveryUserId);
    if (!project || !user) return;

    setRecoveringProject(true);
    try {
      const response = await fetch('/api/admin/project-members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          projectId: project.id,
          userId: user.id,
          role: 'owner',
          viewLanguages: null,
          editLanguages: null,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const description = typeof payload.error === 'string' ? payload.error : 'Could not assign an owner.';
        toast({ title: 'Owner recovery failed', description, variant: 'error' });
        return;
      }

      toast({
        title: 'Project owner assigned',
        description: `${accountLabel(user)} is now an owner of ${project.name}.`,
        variant: 'success',
      });
      setRecoveryProjectId(null);
      setRecoveryUserId('');
      await fetchDirectory();
    } catch (error) {
      console.error('Failed to recover ownerless project', error);
      toast({
        title: 'Owner recovery failed',
        description: error instanceof Error ? error.message : 'Unexpected error occurred.',
        variant: 'error',
      });
    } finally {
      setRecoveringProject(false);
    }
  }, [accessToken, recoveryProjectId, recoveryUserId, projects, usersById, toast, fetchDirectory]);

  const canSubmitNewUser = Boolean(email.trim() && password.length >= 12 && !submitting);
  const canSubmitAssignment = Boolean(
    assignmentDraft &&
    assignmentDraft.projectId &&
    (assignmentDraft.role === 'owner' || assignmentDraft.viewLanguages.size > 0)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Users &amp; access</DialogTitle>
          <DialogDescription>
            Create accounts, grant only the access each person needs, and recover ownerless projects.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <details className="group rounded-lg border border-border bg-surface-hover">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-surface [&::-webkit-details-marker]:hidden">
              <span>
                <span className="block font-medium text-foreground">How access works</span>
                <span className="block text-xs text-muted">Create an account, grant a project, then choose languages.</span>
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="space-y-3 border-t border-border p-4">
              <ol className="grid gap-3 text-sm sm:grid-cols-3" aria-label="User access setup steps">
                {[
                  ['1', 'Create account', 'Set the user’s sign-in details.'],
                  ['2', 'Grant project access', 'Choose a project and role.'],
                  ['3', 'Choose editable languages', 'Give members view or edit access.'],
                ].map(([step, title, description]) => (
                  <li key={step} className="flex gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-accent">{step}</span>
                    <span>
                      <span className="block font-medium text-foreground">{title}</span>
                      <span className="block text-xs text-muted">{description}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <div className="grid gap-2 border-t border-border pt-3 text-xs text-muted sm:grid-cols-2">
                <p><span className="font-medium text-foreground">Platform admin:</span> Full access to every project, plus account and access management.</p>
                <p><span className="font-medium text-foreground">Project access:</span> Owners control one project; members only see or edit their assigned languages.</p>
              </div>
            </div>
          </details>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search accounts or projects"
            aria-label="Search users and access"
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--accent)/0.5)]"
          />
          <Button variant="outline" onClick={() => setShowCreateUser((current) => !current)}>
            {showCreateUser ? 'Cancel account creation' : 'Create account'}
          </Button>
        </div>

        {showCreateUser && (
          <form onSubmit={handleCreateUser} className="space-y-4 rounded-lg border border-border bg-surface/50 p-4" noValidate>
            <h3 className="text-sm font-semibold text-foreground">Create account</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-muted" htmlFor="new-user-email">Email address</label>
                <input
                  id="new-user-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  placeholder="user@example.com"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--accent)/0.5)]"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-muted" htmlFor="new-user-display-name">Display name (optional)</label>
                <input
                  id="new-user-display-name"
                  type="text"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="e.g. Alex Smith"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--accent)/0.5)]"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-muted" htmlFor="new-user-password">Password</label>
              <div className="relative">
                <input
                  id="new-user-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  placeholder="Min. 12 characters"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 pr-10 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--accent)/0.5)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted transition-colors hover:text-foreground"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={!canSubmitNewUser}>
                {submitting ? <span className="inline-flex items-center gap-2"><Spinner size={16} />Creating…</span> : 'Create account'}
              </Button>
            </div>
          </form>
        )}

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Accounts</h3>
            {loadingDirectory && <span className="inline-flex items-center gap-2 text-xs text-muted"><Spinner size={14} />Loading…</span>}
          </div>

          {!loadingDirectory && filteredUsers.length === 0 && (
            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted">No matching accounts.</p>
          )}

          <ul className="space-y-3">
            {filteredUsers.map((user) => {
              const isSelf = user.id === currentUserId;
              const isDeleting = deletingUserId === user.id;
              const confirmingDelete = confirmDeleteUserId === user.id;
              const confirmingAdmin = adminConfirmation?.userId === user.id;
              const updatingAdmin = updatingAdminUserId === user.id;
              const availableProjects = projects.filter((project) => (
                !user.assignments.some((assignment) => assignment.projectId === project.id)
              ));

              return (
                <li key={user.id} className="space-y-3 rounded-lg border border-border bg-surface px-4 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">{accountLabel(user)}</p>
                      {user.displayName && <p className="text-xs text-muted">{user.email}</p>}
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className={`inline-flex rounded-full px-2 py-0.5 font-medium ${
                          user.isPlatformAdmin
                            ? 'bg-[hsl(var(--accent)/0.14)] text-accent'
                            : 'bg-surface-hover text-muted'
                        }`}>
                          {user.isPlatformAdmin ? 'Platform admin' : 'Standard account'}
                        </span>
                        <span className={`inline-flex rounded-full px-2 py-0.5 font-medium ${
                          user.emailConfirmedAt
                            ? 'bg-[hsl(var(--success)/0.14)] text-success'
                            : 'bg-[hsl(var(--warning)/0.16)] text-warning'
                        }`}>
                          {user.emailConfirmedAt ? 'Confirmed' : 'Unconfirmed'}
                        </span>
                        {isSelf && <span className="inline-flex rounded-full bg-[hsl(var(--accent)/0.14)] px-2 py-0.5 font-medium text-accent">You</span>}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {user.isPlatformAdmin ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setAdminConfirmation({ userId: user.id, action: 'revoke' });
                            setRemoveMemberships(false);
                          }}
                          disabled={isSelf || updatingAdmin}
                          title={isSelf ? 'Ask another admin to revoke your access.' : undefined}
                        >
                          Revoke platform admin
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAdminConfirmation({ userId: user.id, action: 'grant' })}
                          disabled={updatingAdmin}
                        >
                          Grant platform admin
                        </Button>
                      )}
                      {!user.isPlatformAdmin && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startAssignment(user)}
                          disabled={availableProjects.length === 0}
                        >
                          Add project access
                        </Button>
                      )}
                      {!isSelf && (
                        <Button
                          variant="destructiveGhost"
                          size="sm"
                          onClick={() => setConfirmDeleteUserId(user.id)}
                          disabled={isDeleting}
                        >
                          Delete user account
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted">Project assignments</p>
                    {user.assignments.length === 0 ? (
                      <p className="text-xs text-muted">No project assignments.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {user.assignments.map((assignment) => (
                          <span key={assignment.id} className="inline-flex flex-col rounded-md border border-border bg-surface-hover px-2 py-1 text-xs text-muted">
                            <span className="font-medium text-foreground">{assignment.projectName} · {assignment.role === 'owner' ? 'Owner' : 'Member'}</span>
                            {assignment.role === 'member' && <span>View {formatLanguages(assignment.viewLanguages)} · Edit {formatLanguages(assignment.editLanguages)}</span>}
                            {user.isPlatformAdmin && <span className="text-warning">Dormant while global access is active</span>}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {confirmingAdmin && (
                    <div className="space-y-3 rounded-lg border border-border bg-surface-hover p-3 text-sm">
                      {adminConfirmation.action === 'grant' ? (
                        <p className="text-muted">
                          Grant global access to every project? Existing project assignments will be retained as dormant access.
                        </p>
                      ) : (
                        <>
                          <p className="text-muted">Revoke global access from this account?</p>
                          {user.assignments.length > 0 && (
                            <div className="space-y-2">
                              <label className="flex items-start gap-2">
                                <input type="radio" checked={!removeMemberships} onChange={() => setRemoveMemberships(false)} />
                                <span>Restore {user.assignments.length} retained project assignment{user.assignments.length === 1 ? '' : 's'}.</span>
                              </label>
                              <label className="flex items-start gap-2 text-danger">
                                <input type="radio" checked={removeMemberships} onChange={() => setRemoveMemberships(true)} />
                                <span>Remove all retained project assignments.</span>
                              </label>
                            </div>
                          )}
                        </>
                      )}
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setAdminConfirmation(null)} disabled={updatingAdmin}>Cancel</Button>
                        <Button size="sm" onClick={() => void handleAdminAccess()} disabled={updatingAdmin}>
                          {updatingAdmin ? <span className="inline-flex items-center gap-2"><Spinner size={14} />Saving…</span> : 'Confirm'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {confirmingDelete && (
                    <div className="space-y-2 rounded-lg border border-danger/30 bg-[hsl(var(--danger)/0.06)] p-3">
                      <p className="text-xs text-warning">
                        Permanently delete {accountLabel(user)}’s sign-in account and all project access? This cannot be undone. Projects where they are the only owner will become ownerless.
                      </p>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setConfirmDeleteUserId(null)} disabled={isDeleting}>Cancel</Button>
                        <Button variant="destructive" size="sm" onClick={() => void handleDeleteUser(user)} disabled={isDeleting}>
                          {isDeleting ? <span className="inline-flex items-center gap-2"><Spinner size={14} />Deleting…</span> : 'Delete user account'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {assignmentDraft?.userId === user.id && selectedAssignmentProject && (
                    <div className="space-y-3 rounded-lg border border-border bg-surface-hover p-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1 text-xs font-medium text-muted">
                          Project
                          <select
                            value={assignmentDraft.projectId}
                            onChange={(event) => selectAssignmentProject(event.target.value)}
                            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
                          >
                            {availableProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                          </select>
                        </label>
                        <label className="space-y-1 text-xs font-medium text-muted">
                          Role
                          <select
                            value={assignmentDraft.role}
                            onChange={(event) => setAssignmentDraft((current) => current ? { ...current, role: event.target.value as ProjectRole } : null)}
                            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
                          >
                            <option value="member">Member</option>
                            <option value="owner">Owner</option>
                          </select>
                          <span className="block font-normal">
                            {assignmentDraft.role === 'owner'
                              ? 'Owners have full project control and access to every language.'
                              : 'Members only see and edit the languages selected below.'}
                          </span>
                        </label>
                      </div>

                      {assignmentDraft.role === 'member' && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-muted">View languages</p>
                            <p className="text-xs text-muted">The member can open and read these languages.</p>
                            {selectedAssignmentProject.languages.length === 0 ? (
                              <p className="text-xs text-warning">This project has no active languages.</p>
                            ) : selectedAssignmentProject.languages.map((language) => (
                              <label key={language.code} className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={assignmentDraft.viewLanguages.has(language.code)}
                                  onChange={() => toggleViewLanguage(language.code)}
                                />
                                {language.code.toUpperCase()}{language.name ? ` · ${language.name}` : ''}
                              </label>
                            ))}
                          </div>
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-muted">Edit languages</p>
                            <p className="text-xs text-muted">The member can change translations in these languages. Leave all unchecked for read-only access.</p>
                            {Array.from(assignmentDraft.viewLanguages).map((code) => (
                              <label key={code} className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={assignmentDraft.editLanguages.has(code)}
                                  onChange={() => toggleEditLanguage(code)}
                                />
                                {code.toUpperCase()}
                              </label>
                            ))}
                            {assignmentDraft.viewLanguages.size === 0 && <p className="text-xs text-muted">Select view access first.</p>}
                          </div>
                        </div>
                      )}

                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setAssignmentDraft(null)} disabled={assigningProjectAccess}>Cancel</Button>
                        <Button size="sm" onClick={() => void submitAssignment()} disabled={!canSubmitAssignment || assigningProjectAccess}>
                          {assigningProjectAccess ? <span className="inline-flex items-center gap-2"><Spinner size={14} />Assigning…</span> : 'Assign access'}
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="space-y-3 border-t border-border pt-4">
          <h3 className="text-sm font-semibold text-foreground">Projects</h3>
          {!loadingDirectory && filteredProjects.length === 0 && (
            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted">No matching projects.</p>
          )}
          <ul className="grid gap-3 lg:grid-cols-2">
            {filteredProjects.map((project) => {
              const members = projectMembers.get(project.id) ?? [];
              const activeMembers = members.filter(({ user }) => !user.isPlatformAdmin);
              const dormantMembers = members.filter(({ user }) => user.isPlatformAdmin);
              const owners = activeMembers.filter(({ assignment }) => assignment.role === 'owner');
              const standardMembers = activeMembers.filter(({ assignment }) => assignment.role === 'member');
              const ownerless = owners.length === 0;
              const recovering = recoveryProjectId === project.id;

              return (
                <li key={project.id} className="space-y-2 rounded-lg border border-border bg-surface px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{project.name}</p>
                    {ownerless && <span className="rounded-full bg-[hsl(var(--warning)/0.16)] px-2 py-0.5 text-xs font-medium text-warning">Ownerless</span>}
                  </div>
                  <p className="text-xs text-muted">
                    Owners: {owners.length > 0 ? owners.map(({ user }) => accountLabel(user)).join(', ') : 'None'}
                  </p>
                  <p className="text-xs text-muted">
                    Members: {standardMembers.length > 0 ? standardMembers.map(({ user }) => accountLabel(user)).join(', ') : 'None'}
                  </p>
                  {dormantMembers.length > 0 && (
                    <p className="text-xs text-warning">
                      Dormant: {dormantMembers.map(({ user, assignment }) => `${accountLabel(user)} (${assignment.role})`).join(', ')}
                    </p>
                  )}

                  {ownerless && !recovering && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRecoveryProjectId(project.id);
                        setRecoveryUserId(nonAdminUsers[0]?.id ?? '');
                      }}
                      disabled={nonAdminUsers.length === 0}
                    >
                      Assign owner
                    </Button>
                  )}

                  {ownerless && recovering && (
                    <div className="space-y-2 rounded-lg border border-border bg-surface-hover p-3">
                      <label className="space-y-1 text-xs font-medium text-muted">
                        Existing non-admin account
                        <select
                          value={recoveryUserId}
                          onChange={(event) => setRecoveryUserId(event.target.value)}
                          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
                        >
                          {nonAdminUsers.map((user) => <option key={user.id} value={user.id}>{accountLabel(user)}</option>)}
                        </select>
                      </label>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setRecoveryProjectId(null)} disabled={recoveringProject}>Cancel</Button>
                        <Button size="sm" onClick={() => void recoverOwnerlessProject()} disabled={!recoveryUserId || recoveringProject}>
                          {recoveringProject ? <span className="inline-flex items-center gap-2"><Spinner size={14} />Assigning…</span> : 'Assign owner'}
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
