'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Checkbox, Input, Label, Textarea } from '@jobportal/ui';
import { api } from '../../lib/profile/api-client';

interface ExperienceRow {
  id: number;
  companyName: string;
  title: string;
  startDate: string;
  endDate: string | null;
  isCurrent: boolean;
  description: string | null;
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

export function ExperienceManager({ initial }: { initial: ExperienceRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<ExperienceRow[]>(initial);
  const [adding, setAdding] = useState(false);
  const [isCurrent, setIsCurrent] = useState(false);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {
      companyName: String(f.get('companyName') ?? ''),
      title: String(f.get('title') ?? ''),
      startDate: new Date(String(f.get('startDate'))).toISOString(),
    };
    if (!isCurrent && f.get('endDate')) {
      payload['endDate'] = new Date(String(f.get('endDate'))).toISOString();
    }
    if (isCurrent) payload['isCurrent'] = true;
    const desc = f.get('description');
    if (desc) payload['description'] = String(desc);

    const res = await api<ExperienceRow>('/me/experience', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setRows([res.data, ...rows]);
      setAdding(false);
      setIsCurrent(false);
      router.refresh();
    }
  }

  async function onDelete(id: number) {
    const res = await api(`/me/experience/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setRows(rows.filter((r) => r.id !== id));
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      <ul className="space-y-3">
        {rows.length === 0 && (
          <li className="rounded-md border border-dashed border-[var(--color-border)] p-6 text-sm text-[var(--color-fg-muted)]">
            No work experience added yet.
          </li>
        )}
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex items-start justify-between gap-4 rounded-md border border-[var(--color-border)] p-4"
          >
            <div>
              <p className="text-sm font-medium text-[var(--color-fg)]">{r.title}</p>
              <p className="text-sm text-[var(--color-fg-muted)]">{r.companyName}</p>
              <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">
                {fmt(r.startDate)} – {r.isCurrent ? 'present' : r.endDate ? fmt(r.endDate) : '—'}
              </p>
              {r.description && (
                <p className="mt-2 text-sm text-[var(--color-fg)] whitespace-pre-line">{r.description}</p>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={() => onDelete(r.id)}>
              Remove
            </Button>
          </li>
        ))}
      </ul>

      {adding ? (
        <form onSubmit={onCreate} className="space-y-4 rounded-md border border-[var(--color-border)] p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field name="companyName" label="Company" required />
            <Field name="title" label="Title" required />
            <Field name="startDate" label="Start date" type="date" required />
            <Field
              name="endDate"
              label="End date"
              type="date"
              required={!isCurrent}
              disabled={isCurrent}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="isCurrent"
              checked={isCurrent}
              onCheckedChange={(v) => setIsCurrent(v === true)}
            />
            <Label htmlFor="isCurrent" className="text-sm text-[var(--color-fg)]">
              I currently work here
            </Label>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" rows={4} maxLength={2000} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm">
              Add
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="secondary" onClick={() => setAdding(true)}>
          Add experience
        </Button>
      )}
    </div>
  );
}

function Field({
  name,
  label,
  type = 'text',
  required,
  disabled,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} required={required} disabled={disabled} />
    </div>
  );
}
