'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';

type ApiKeyRecord = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

type ProjectApiKeysDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
  projectName?: string | null;
  accessToken: string | null;
};

class ApiKeysRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function requestApiKeys(projectId: string, accessToken: string): Promise<ApiKeyRecord[]> {
  const response = await fetch(`/api/admin/project-api-keys?projectId=${encodeURIComponent(projectId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    const message = typeof errorPayload.error === 'string' ? errorPayload.error : 'Failed to load API keys.';
    throw new ApiKeysRequestError(message, response.status);
  }

  const payload = (await response.json()) as { keys?: ApiKeyRecord[] };
  return Array.isArray(payload.keys) ? payload.keys : [];
}

function formatDate(value: string | null) {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: 'Copy failed', description: 'Select the text and copy it manually.', variant: 'error' });
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className="shrink-0 rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-foreground transition-colors"
      aria-label={label}
    >
      {copied ? <Check size={15} /> : <Copy size={15} />}
    </button>
  );
}

export default function ProjectApiKeysDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  accessToken,
}: ProjectApiKeysDialogProps) {
  const { toast } = useToast();
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const handleLoadError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Something went wrong while loading API keys.';
    if (error instanceof ApiKeysRequestError && (error.status === 401 || error.status === 403)) {
      toast({ title: 'Access denied', description: message, variant: 'error' });
      onOpenChange(false);
      return;
    }
    console.error('Failed to fetch API keys', error);
    toast({ title: 'Could not load API keys', description: message, variant: 'error' });
    setKeys([]);
  }, [toast, onOpenChange]);

  // Reset the form whenever the dialog opens or closes, during render rather than in an effect.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    setNewKeyName('');
    setCreatedSecret(null);
    setConfirmRevokeId(null);
    if (open && projectId && accessToken) {
      setLoadingKeys(true);
    } else if (open) {
      setKeys([]);
    }
  }

  useEffect(() => {
    if (!open || !projectId || !accessToken) return;
    let isCurrent = true;

    const loadKeys = async () => {
      try {
        const nextKeys = await requestApiKeys(projectId, accessToken);
        if (isCurrent) setKeys(nextKeys);
      } catch (error) {
        if (isCurrent) handleLoadError(error);
      } finally {
        if (isCurrent) setLoadingKeys(false);
      }
    };

    void loadKeys();
    return () => {
      isCurrent = false;
    };
  }, [open, projectId, accessToken, handleLoadError]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = newKeyName.trim();
    if (!projectId || !accessToken || !name) return;

    setCreating(true);
    try {
      const response = await fetch('/api/admin/project-api-keys', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ projectId, name }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const description = typeof payload.error === 'string' ? payload.error : 'Could not create the API key.';
        toast({ title: 'API key not created', description, variant: 'error' });
        return;
      }

      const created = payload.key as ApiKeyRecord | undefined;
      if (!created?.id || typeof payload.secret !== 'string') {
        throw new Error('The server returned an invalid response.');
      }

      setKeys((prev) => [created, ...prev]);
      setCreatedSecret(payload.secret);
      setNewKeyName('');
    } catch (error) {
      console.error('Failed to create API key', error);
      toast({
        title: 'API key not created',
        description: error instanceof Error ? error.message : 'Unexpected error occurred.',
        variant: 'error',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    if (!projectId || !accessToken) return;

    setRevokingId(keyId);
    try {
      const params = new URLSearchParams({ projectId, keyId });
      const response = await fetch(`/api/admin/project-api-keys?${params.toString()}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const description = typeof payload.error === 'string' ? payload.error : 'Could not revoke the API key.';
        toast({ title: 'API key not revoked', description, variant: 'error' });
        return;
      }

      const revoked = payload.key as ApiKeyRecord | undefined;
      setKeys((prev) => prev.map((key) => (key.id === keyId && revoked ? revoked : key)));
      toast({ title: 'API key revoked', description: 'Requests using this key are now rejected.', variant: 'success' });
    } catch (error) {
      console.error('Failed to revoke API key', error);
      toast({
        title: 'API key not revoked',
        description: error instanceof Error ? error.message : 'Unexpected error occurred.',
        variant: 'error',
      });
    } finally {
      setRevokingId(null);
      setConfirmRevokeId(null);
    }
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const exportUrl = projectId ? `${origin}/api/v1/projects/${projectId}/export` : '';
  const exampleCommand = `curl -H "Authorization: Bearer $GLOTTER_API_KEY" \\\n  "${exportUrl}?languages=en" -o en.json`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>API keys</DialogTitle>
          <DialogDescription>
            Read-only keys that let CI jobs, build scripts, and apps download
            {projectName ? ` ${projectName}` : ' this project'}&apos;s translations.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void handleCreate(event)} className="flex gap-2">
          <label className="sr-only" htmlFor="api-key-name">Key name</label>
          <input
            id="api-key-name"
            type="text"
            value={newKeyName}
            onChange={(event) => setNewKeyName(event.target.value)}
            maxLength={100}
            placeholder="Key name, e.g. iOS nightly build"
            className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--accent)/0.5)]"
          />
          <Button type="submit" disabled={!newKeyName.trim() || creating || !projectId || !accessToken}>
            {creating ? (
              <span className="inline-flex items-center gap-2">
                <Spinner size={16} />
                Creating…
              </span>
            ) : (
              'Create key'
            )}
          </Button>
        </form>

        {createdSecret && (
          <div className="mt-4 rounded-lg border border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.1)] p-3 space-y-2">
            <p className="text-sm font-medium text-foreground">Copy this key now. It won&apos;t be shown again.</p>
            <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
              <code className="flex-1 break-all font-mono text-xs text-foreground">{createdSecret}</code>
              <CopyButton value={createdSecret} label="Copy API key" />
            </div>
          </div>
        )}

        <div className="mt-6">
          <p className="text-sm font-medium text-foreground mb-2">Keys</p>
          {loadingKeys ? (
            <div className="flex justify-center py-6">
              <Spinner size={20} />
            </div>
          ) : keys.length === 0 ? (
            <p className="text-sm text-muted py-4">No API keys yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {keys.map((key) => {
                const isRevoked = Boolean(key.revokedAt);
                return (
                  <li key={key.id} className={cn('flex items-center gap-3 px-3 py-2.5', isRevoked && 'opacity-60')}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{key.name}</p>
                      <p className="text-xs text-muted">
                        <span className="font-mono">{key.keyPrefix}…</span>
                        {' · '}Created {formatDate(key.createdAt)}
                        {' · '}Last used {formatDate(key.lastUsedAt)}
                        {isRevoked && ` · Revoked ${formatDate(key.revokedAt)}`}
                      </p>
                    </div>
                    {!isRevoked && (
                      confirmRevokeId === key.id ? (
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setConfirmRevokeId(null)} disabled={revokingId === key.id}>
                            Cancel
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => void handleRevoke(key.id)} disabled={revokingId === key.id}>
                            {revokingId === key.id ? <Spinner size={14} /> : 'Revoke'}
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="destructiveGhost" onClick={() => setConfirmRevokeId(key.id)}>
                          Revoke
                        </Button>
                      )
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {projectId && (
          <div className="mt-6 space-y-2">
            <p className="text-sm font-medium text-foreground">Usage</p>
            <p className="text-xs text-muted">
              Add <code className="font-mono">languages=en,fr</code>, <code className="font-mono">format=flat</code>,
              {' '}<code className="font-mono">fallback=en</code>, or <code className="font-mono">type=zip</code>.
              {' '}Without <code className="font-mono">languages</code>, every active language is returned as a ZIP.
              {' '}Send the response&apos;s ETag in <code className="font-mono">If-None-Match</code> to get 304 when nothing changed.
              {' '}List language codes at <code className="font-mono">/api/v1/projects/{projectId}/languages</code>.
            </p>
            <div className="flex items-start gap-2 rounded-md border border-border bg-surface px-3 py-2">
              <pre className="flex-1 overflow-x-auto font-mono text-xs text-foreground whitespace-pre">{exampleCommand}</pre>
              <CopyButton value={exampleCommand} label="Copy example command" />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
