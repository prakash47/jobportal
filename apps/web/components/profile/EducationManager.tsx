'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Label } from '@jobportal/ui';
import { api } from '../../lib/profile/api-client';

interface EducationRow {
  id: number;
  institute: string;
  degree: string;
  fieldOfStudy: string | null;
  startYear: number;
  endYear: number | null;
  grade: string | null;
}

export function EducationManager({ initial }: { initial: EducationRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<EducationRow[]>(initial);
  const [adding, setAdding] = useState(false);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {
      institute: String(f.get('institute') ?? ''),
      degree: String(f.get('degree') ?? ''),
      startYear: Number(f.get('startYear')),
    };
    const fos = f.get('fieldOfStudy');
    if (fos) payload['fieldOfStudy'] = String(fos);
    const ey = f.get('endYear');
    if (ey) payload['endYear'] = Number(ey);
    const gr = f.get('grade');
    if (gr) payload['grade'] = String(gr);

    const res = await api<EducationRow>('/me/education', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setRows([...rows, res.data]);
      setAdding(false);
      router.refresh();
    }
  }

  async function onDelete(id: number) {
    const res = await api(`/me/education/${id}`, { method: 'DELETE' });
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
            No education added yet.
          </li>
        )}
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex items-start justify-between gap-4 rounded-md border border-[var(--color-border)] p-4"
          >
            <div>
              <p className="text-sm font-medium text-[var(--color-fg)]">{r.degree}</p>
              <p className="text-sm text-[var(--color-fg-muted)]">
                {r.institute}
                {r.fieldOfStudy ? ` · ${r.fieldOfStudy}` : ''}
              </p>
              <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">
                {r.startYear} – {r.endYear ?? 'present'}
                {r.grade ? ` · ${r.grade}` : ''}
              </p>
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
            <Field name="institute" label="Institute" required />
            <Field name="degree" label="Degree" required />
            <Field name="fieldOfStudy" label="Field of study" />
            <Field name="grade" label="Grade" />
            <Field name="startYear" label="Start year" type="number" required min={1950} max={2100} />
            <Field name="endYear" label="End year" type="number" min={1950} max={2100} />
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
          Add education
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
  min,
  max,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  min?: number;
  max?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} required={required} min={min} max={max} />
    </div>
  );
}
