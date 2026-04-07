'use client';

import { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';

type UserRecord = {
  id: string;
  email: string | null;
  displayName: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
};

type UserManagementDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accessToken: string | null;
  currentUserId: string | null;
};

export default function UserManagementDialog({
  open,
  onOpenChange,
  accessToken,
  currentUserId,
}: UserManagementDialogProps) {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    if (!accessToken) return;

    setLoadingUsers(true);
    try {
      const response = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = typeof payload.error === 'string' ? payload.error : 'Failed to load users.';
        if (response.status === 401 || response.status === 403) {
          toast({ title: 'Access denied', description: message, variant: 'error' });
          onOpenChange(false);
          return;
        }
        throw new Error(message);
      }

      const payload = (await response.json()) as { users?: UserRecord[] };
      const sorted = (Array.isArray(payload.users) ? payload.users : []).sort((a, b) => {
        const ea = a.email?.toLowerCase() ?? '';
        const eb = b.email?.toLowerCase() ?? '';
        return ea.localeCompare(eb);
      });
      setUsers(sorted);
    } catch (error) {
      console.error('Failed to fetch users', error);
      toast({
        title: 'Could not load users',
        description: error instanceof Error ? error.message : 'Something went wrong.',
        variant: 'error',
      });
    } finally {
      setLoadingUsers(false);
    }
  }, [accessToken, toast, onOpenChange]);

  useEffect(() => {
    if (open) {
      void fetchUsers();
      setEmail('');
      setDisplayName('');
      setPassword('');
      setShowPassword(false);
      setConfirmDeleteUserId(null);
    } else {
      setEmail('');
      setDisplayName('');
      setPassword('');
      setShowPassword(false);
      setConfirmDeleteUserId(null);
    }
  }, [open, fetchUsers]);

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

        toast({
          title: 'User created',
          description: `${displayName.trim() || email.trim()} has been created and can log in immediately.`,
          variant: 'success',
        });

        setEmail('');
        setDisplayName('');
        setPassword('');
        void fetchUsers();
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
    [accessToken, email, displayName, password, toast, fetchUsers]
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
          toast({ title: 'Failed to delete user', description, variant: 'error' });
          return;
        }

        setUsers((prev) => prev.filter((u) => u.id !== user.id));
        toast({
          title: 'User deleted',
          description: `${user.email ?? user.id} has been permanently deleted.`,
          variant: 'success',
        });
      } catch (error) {
        console.error('Failed to delete user', error);
        toast({
          title: 'Failed to delete user',
          description: error instanceof Error ? error.message : 'Unexpected error occurred.',
          variant: 'error',
        });
      } finally {
        setDeletingUserId(null);
      }
    },
    [accessToken, toast]
  );

  const canSubmit = Boolean(email.trim() && password && !submitting);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage users</DialogTitle>
          <DialogDescription>
            Create platform users and manage their accounts. Assign users to projects via the project&apos;s member settings.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleCreateUser} className="space-y-4" noValidate>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-muted" htmlFor="new-user-email">
              Email address
            </label>
            <input
              id="new-user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="user@example.com"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-muted" htmlFor="new-user-display-name">
              Display name <span className="text-muted font-normal">(optional)</span>
            </label>
            <input
              id="new-user-display-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Alex Smith"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-muted" htmlFor="new-user-password">
              Password
            </label>
            <div className="relative">
              <input
                id="new-user-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Min. 6 characters"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 pr-10 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner size={16} />
                  Creating…
                </span>
              ) : (
                'Create user'
              )}
            </Button>
          </div>
        </form>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">All users</h3>
            {loadingUsers && (
              <span className="inline-flex items-center gap-2 text-xs text-muted">
                <Spinner size={14} />
                Loading…
              </span>
            )}
          </div>

          {!loadingUsers && users.length === 0 && (
            <p className="text-sm text-muted border border-dashed border-border rounded-lg px-3 py-4 text-center">
              No users found.
            </p>
          )}

          {users.length > 0 && (
            <ul className="space-y-2">
              {users.map((user) => {
                const isSelf = user.id === currentUserId;
                const isDeleting = deletingUserId === user.id;
                const isConfirming = confirmDeleteUserId === user.id;

                return (
                  <li
                    key={user.id}
                    className="flex flex-col gap-3 rounded-lg border border-border bg-surface px-3 py-2 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">{user.displayName ?? user.email ?? user.id}</p>
                      {user.displayName && (
                        <p className="text-xs text-muted">{user.email}</p>
                      )}
                      <div className="flex items-center gap-2 text-xs text-muted">
                        {user.emailConfirmedAt ? (
                          <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                            Confirmed
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">
                            Unconfirmed
                          </span>
                        )}
                        {isSelf && (
                          <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                            You
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                      <div className="text-right text-xs text-muted">
                        {user.lastSignInAt ? (
                          <span>Last seen {new Date(user.lastSignInAt).toLocaleDateString()}</span>
                        ) : (
                          <span>Never signed in</span>
                        )}
                      </div>

                      {!isSelf && (
                        <div className="flex items-center gap-2">
                          {isConfirming ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setConfirmDeleteUserId(null)}
                                disabled={isDeleting}
                              >
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => void handleDeleteUser(user)}
                                disabled={isDeleting}
                              >
                                {isDeleting ? (
                                  <span className="inline-flex items-center gap-2">
                                    <Spinner size={14} />
                                    Deleting…
                                  </span>
                                ) : (
                                  'Confirm delete'
                                )}
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => setConfirmDeleteUserId(user.id)}
                              disabled={isDeleting}
                            >
                              Delete
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
