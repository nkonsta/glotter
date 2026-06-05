'use client';

import { useEffect, useState } from 'react';
import { Check, Eye, EyeOff } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';

type ChangePasswordDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentDisplayName?: string | null;
};

export default function ChangePasswordDialog({ open, onOpenChange, currentDisplayName }: ChangePasswordDialogProps) {
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState(currentDisplayName ?? '');
  const [savingDisplayName, setSavingDisplayName] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    setDisplayName(currentDisplayName ?? '');
  }, [currentDisplayName]);

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setDisplayName(currentDisplayName ?? '');
      setNewPassword('');
      setConfirmPassword('');
      setShowNew(false);
      setShowConfirm(false);
      setValidationError('');
    }
    onOpenChange(nextOpen);
  };

  const handleSaveDisplayName = async () => {
    setSavingDisplayName(true);
    try {
      const { error } = await supabase.auth.updateUser({ data: { display_name: displayName.trim() || null } });
      if (error) {
        toast({ title: 'Failed to update display name', description: error.message, variant: 'error' });
        return;
      }
      toast({ title: 'Display name updated', description: 'Your display name has been saved.', variant: 'success' });
    } catch (err) {
      toast({
        title: 'Failed to update display name',
        description: err instanceof Error ? err.message : 'Unexpected error occurred.',
        variant: 'error',
      });
    } finally {
      setSavingDisplayName(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setValidationError('');

    if (newPassword.length < 6) {
      setValidationError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setValidationError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        toast({ title: 'Failed to update password', description: error.message, variant: 'error' });
        return;
      }
      toast({ title: 'Password updated', description: 'Your password has been changed successfully.', variant: 'success' });
      handleClose(false);
    } catch (err) {
      toast({
        title: 'Failed to update password',
        description: err instanceof Error ? err.message : 'Unexpected error occurred.',
        variant: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = Boolean(newPassword && confirmPassword && !submitting);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>Update your display name or change your password.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-muted" htmlFor="profile-display-name">
            Display name
          </label>
          <div className="relative">
            <input
              id="profile-display-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Alex Smith"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 pr-10 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--accent)/0.5)]"
            />
            {displayName.trim() !== (currentDisplayName ?? '') && (
              <button
                type="button"
                onClick={() => void handleSaveDisplayName()}
                disabled={savingDisplayName}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors disabled:opacity-50"
                aria-label="Save display name"
              >
                {savingDisplayName ? <Spinner size={15} /> : <Check size={15} />}
              </button>
            )}
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium text-foreground mb-3">Change password</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-muted" htmlFor="new-password">
              New password
            </label>
            <div className="relative">
              <input
                id="new-password"
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                placeholder="Min. 6 characters"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 pr-10 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--accent)/0.5)]"
              />
              <button
                type="button"
                onClick={() => setShowNew((prev) => !prev)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors"
                aria-label={showNew ? 'Hide password' : 'Show password'}
              >
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-muted" htmlFor="confirm-password">
              Confirm password
            </label>
            <div className="relative">
              <input
                id="confirm-password"
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Repeat new password"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 pr-10 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--accent)/0.5)]"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((prev) => !prev)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors"
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {validationError && (
            <p className="text-sm text-danger">{validationError}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner size={16} />
                  Updating…
                </span>
              ) : (
                'Update password'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
