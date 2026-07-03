'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@jobportal/ui';
import type { SupportTicketCategory } from '@jobportal/db';
import { api } from '../../lib/api-client';
import { CATEGORY_OPTIONS } from './ticket-labels';

interface CreatedTicket {
  id: number;
}

// "Raise a ticket" — a self-contained trigger + dialog so it can be dropped into
// the tickets-list header or an empty state. On success it navigates to the new
// ticket's thread and refreshes the list. Client validation mirrors the server
// DTO (CreateTicketDto); the BFF re-validates.
export function RaiseTicketDialog({
  variant = 'primary',
  triggerLabel = 'Raise a ticket',
}: {
  variant?: 'primary' | 'secondary';
  triggerLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<SupportTicketCategory>('ACCOUNT');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const subjectId = useId();
  const descriptionId = useId();
  const descHintId = useId();

  function reset() {
    setCategory('ACCOUNT');
    setSubject('');
    setDescription('');
    setError(null);
  }

  function validate(): string | null {
    if (subject.trim().length < 4) return 'Enter a subject (at least 4 characters).';
    if (description.trim().length < 10) return 'Describe the issue (at least 10 characters).';
    return null;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    const res = await api<CreatedTicket>('/recruiter/support/tickets', {
      method: 'POST',
      body: JSON.stringify({
        category,
        subject: subject.trim(),
        description: description.trim(),
      }),
    });
    setLoading(false);

    if (!res.ok) {
      setError(typeof res.message === 'string' ? res.message : 'Could not raise the ticket.');
      return;
    }

    reset();
    setOpen(false);
    router.push(`/support/tickets/${res.data.id}`);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        setOpen(o);
      }}
    >
      <Button variant={variant} onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Raise a ticket</DialogTitle>
          <DialogDescription>
            Tell us what&rsquo;s going on and we&rsquo;ll follow up here. You can reply on the
            ticket to add more detail.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as SupportTicketCategory)}>
              <SelectTrigger aria-label="Category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={subjectId}>Subject</Label>
            <Input
              id={subjectId}
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="A short summary of the issue"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={descriptionId}>Description</Label>
            <Textarea
              id={descriptionId}
              rows={6}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-describedby={descHintId}
            />
            <p id={descHintId} className="text-xs text-[var(--color-fg-muted)]">
              Include steps, job IDs, or links to screenshots — whatever helps us reproduce it.
            </p>
          </div>

          {error && (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              Submit ticket
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
