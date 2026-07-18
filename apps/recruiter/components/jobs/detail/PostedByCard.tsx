import { CollaborateDialog } from './CollaborateDialog';
import { PersonAvatar } from './PersonAvatar';

export interface Person {
  /** Display name (User.name). */
  name: string;
  /** Avatar URL (User.image — set only for OAuth logins); null → initials. */
  image: string | null;
}

export interface PostedByCardProps {
  jobId: number;
  jobTitle: string;
  /** The posting author (User.name/image + Recruiter.designation), or null if the
   * poster's account was removed (postedById is nullable). */
  poster: (Person & { designation: string | null }) | null;
  /** Current collaborators (SRS §4.9 Collaborate) — shown as an avatar stack. */
  collaborators: (Person & { userId: number })[];
  /** Owner-only controls (add/remove collaborators) — the viewer owns this job. */
  isOwner: boolean;
  /** L2 killswitch — hides the Collaborate control when collaboration is killed. */
  collaborateEnabled: boolean;
}

// §7 Posted by — identity of the team member who created this posting (SRS
// §4.9), plus the Collaborate control: the owner can add teammates to help
// manage the job and respond to applicants. Name lives on User.name, the
// (optional) photo on User.image, and the designation on the linked Recruiter
// row. Seeded LOCAL recruiters have no image → an initials avatar.
export function PostedByCard({
  jobId,
  jobTitle,
  poster,
  collaborators,
  isOwner,
  collaborateEnabled,
}: PostedByCardProps) {
  const showCollaborateButton = isOwner && collaborateEnabled;
  // The collaborators subsection appears when there's something to show: existing
  // collaborators (visible to everyone with access) or the owner's add control.
  const showCollaboratorsSection = collaborators.length > 0 || showCollaborateButton;

  return (
    <section
      aria-labelledby="posted-by-heading"
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5"
    >
      <h2 id="posted-by-heading" className="mb-3 text-sm font-semibold text-[var(--color-fg)]">
        Posted by
      </h2>

      <div className="flex items-center gap-3">
        {poster ? (
          <>
            <PersonAvatar name={poster.name} image={poster.image} size={44} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--color-fg)]">{poster.name}</p>
              <p className="truncate text-xs text-[var(--color-fg-muted)]">
                {poster.designation ?? 'Recruiter'}
              </p>
            </div>
          </>
        ) : (
          <p className="text-sm text-[var(--color-fg-muted)]">
            The recruiter who posted this job is no longer on the team.
          </p>
        )}
      </div>

      {showCollaboratorsSection && (
        <div className="mt-4 border-t border-[var(--color-border)] pt-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-[var(--color-fg-muted)]">
              {collaborators.length > 0
                ? `Collaborators (${collaborators.length})`
                : 'Collaborators'}
            </span>
            {showCollaborateButton && (
              <CollaborateDialog
                jobId={jobId}
                jobTitle={jobTitle}
                hasCollaborators={collaborators.length > 0}
              />
            )}
          </div>

          {collaborators.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {collaborators.map((c) => (
                <div key={c.userId} className="flex items-center gap-2">
                  <PersonAvatar name={c.name} image={c.image} size={28} title={c.name} />
                  <span className="text-sm text-[var(--color-fg)]">{c.name}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-[var(--color-fg-muted)]">
              Add a teammate to help manage this job and respond to applicants.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
