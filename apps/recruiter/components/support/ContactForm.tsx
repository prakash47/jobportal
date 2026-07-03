'use client';

import { useId, useState } from 'react';
import { Button, Input, Label, Textarea } from '@jobportal/ui';
import { api } from '../../lib/api-client';

// Contact Us form. Name + email are prefilled from the session but editable.
// Client validation mirrors the server DTO (recruiter-support ContactMessageDto)
// for instant feedback; the BFF re-validates and is the trust boundary. On
// success the subject + message clear while name/email stay for a quick follow-up.
export function ContactForm({
  initialName,
  initialEmail,
}: {
  initialName: string;
  initialEmail: string;
}) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const nameId = useId();
  const emailId = useId();
  const subjectId = useId();
  const messageId = useId();

  function validate(): string | null {
    if (name.trim().length < 2) return 'Enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid email address.';
    if (subject.trim().length < 4) return 'Enter a subject (at least 4 characters).';
    if (message.trim().length < 10) return 'Enter a message (at least 10 characters).';
    return null;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    const res = await api('/recruiter/support/contact', {
      method: 'POST',
      body: JSON.stringify({
        name: name.trim(),
        email: email.trim(),
        subject: subject.trim(),
        message: message.trim(),
      }),
    });
    setLoading(false);

    if (!res.ok) {
      setError(typeof res.message === 'string' ? res.message : 'Could not send your message.');
      return;
    }

    setSuccess(true);
    setSubject('');
    setMessage('');
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-5" noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={nameId}>Name</Label>
          <Input
            id={nameId}
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={emailId}>Email</Label>
          <Input
            id={emailId}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={subjectId}>Subject</Label>
        <Input
          id={subjectId}
          required
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={messageId}>Message</Label>
        <Textarea
          id={messageId}
          rows={6}
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="text-sm text-[var(--color-success)]">
          Thanks — we&rsquo;ve received your message and will get back to you by email.
        </p>
      )}

      <Button type="submit" loading={loading}>
        Send message
      </Button>
    </form>
  );
}
