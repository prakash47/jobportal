'use client';

import { useState } from 'react';
import { Button, Input, Label, Textarea } from '@jobportal/ui';
import { LinkIcon, Plus, Trash2 } from '@jobportal/ui/icons';
import { apiSend } from './api';
import { TagInput } from './TagInput';

export interface ProjectItem {
  id: number;
  title: string;
  description: string | null;
  techStack: string[];
  url: string | null;
}

// Defence-in-depth: only render a clickable href for http(s) URLs. The API now
// rejects other schemes, but a stored javascript:/data: URL must never become an
// <a href> sink (React doesn't sanitize href).
function isHttpUrl(u: string): boolean {
  return /^https?:\/\//i.test(u);
}

// Projects sub-collection: add via an inline form, list with delete. Each
// project persists immediately (POST /me/projects) so it survives Skip, matching
// the reference's build-a-list UX; deletes are optimistic with revert-on-error.
// The list is controlled by the wizard so it survives the step's remount on nav.
export function ProjectsEditor({
  items,
  onItemsChange,
}: {
  items: ProjectItem[];
  onItemsChange: (next: ProjectItem[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [techStack, setTechStack] = useState<string[]>([]);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitle('');
    setDescription('');
    setTechStack([]);
    setUrl('');
    setError(null);
  }
  function cancel() {
    reset();
    setOpen(false);
  }

  async function save() {
    const t = title.trim();
    if (!t) {
      setError('Please enter a project title.');
      return;
    }
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = { title: t };
    if (description.trim()) body.description = description.trim();
    if (techStack.length) body.techStack = techStack;
    if (url.trim()) body.url = url.trim();
    const res = await apiSend<ProjectItem>('/me/projects', 'POST', body);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onItemsChange([res.data, ...items]);
    reset();
    setOpen(false);
  }

  async function remove(id: number) {
    const prev = items;
    onItemsChange(items.filter((x) => x.id !== id));
    const res = await apiSend(`/me/projects/${id}`, 'DELETE');
    if (!res.ok) onItemsChange(prev);
  }

  return (
    <div className="space-y-3">
      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((p) => (
            <li key={p.id} className="rounded-lg border border-[var(--color-border)] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-[var(--color-fg)]">{p.title}</p>
                  {p.description && (
                    <p className="mt-0.5 text-sm text-[var(--color-fg-muted)]">{p.description}</p>
                  )}
                  {p.techStack.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {p.techStack.map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-[var(--color-bg-muted)] px-2 py-0.5 text-xs font-medium text-[var(--color-fg-muted)]"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  {p.url &&
                    (isHttpUrl(p.url) ? (
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex max-w-full items-center gap-1 truncate text-xs font-medium text-[var(--color-primary-600)] hover:underline"
                      >
                        <LinkIcon className="size-3 shrink-0" aria-hidden="true" />
                        <span className="truncate">{p.url}</span>
                      </a>
                    ) : (
                      <span className="mt-2 block truncate text-xs text-[var(--color-fg-muted)]">
                        {p.url}
                      </span>
                    ))}
                </div>
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  aria-label={`Delete project ${p.title}`}
                  className="shrink-0 rounded-md p-1.5 text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-danger)]"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <div className="space-y-3 rounded-lg border border-[var(--color-border)] p-3">
          <div className="space-y-1.5">
            <Label htmlFor="proj-title">Project title</Label>
            <Input
              id="proj-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={150}
              placeholder="e.g. Portfolio website"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="proj-desc">Description</Label>
            <Textarea
              id="proj-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="What did you build?"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tech stack</Label>
            <TagInput value={techStack} onChange={setTechStack} placeholder="Add tech and press Enter…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="proj-url">Project URL (optional)</Label>
            <Input
              id="proj-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              maxLength={500}
              placeholder="https://…"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {error}
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={cancel} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" onClick={save} loading={busy}>
              Save project
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--color-border-strong)] px-4 py-2.5 text-sm font-medium text-[var(--color-fg-muted)] transition-colors hover:border-[var(--color-primary-600)] hover:text-[var(--color-fg)]"
        >
          <Plus className="size-4" aria-hidden="true" />
          Add project
        </button>
      )}
    </div>
  );
}
