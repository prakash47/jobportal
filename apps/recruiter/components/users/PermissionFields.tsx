'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@jobportal/ui';
import {
  LEVEL_LABELS,
  MODULE_ACCESS_LEVELS,
  MODULE_LABELS,
  RECRUITER_MODULES,
  type ModuleAccessLevel,
  type PermissionMap,
} from '../../lib/users/permissions';

// The per-module access matrix (Edit / Read only / No access). Shared by the
// invite + edit dialogs. Controlled — the parent owns the map. There is no
// packaged DataGrid/segmented-control in @jobportal/ui, so this is a Select per
// module (the in-house pattern), tokenized throughout.
export function PermissionFields({
  value,
  onChange,
  disabled,
}: {
  value: PermissionMap;
  onChange: (next: PermissionMap) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="space-y-2.5" disabled={disabled}>
      <legend className="text-xs font-medium uppercase tracking-wide text-[var(--color-fg-muted)]">
        Module access
      </legend>
      <div className="space-y-2">
        {RECRUITER_MODULES.map((mod) => (
          <div key={mod} className="flex items-center justify-between gap-3">
            <span className="text-sm text-[var(--color-fg)]">{MODULE_LABELS[mod]}</span>
            <Select
              value={value[mod]}
              onValueChange={(v) => onChange({ ...value, [mod]: v as ModuleAccessLevel })}
              disabled={disabled ?? false}
            >
              <SelectTrigger className="w-40" aria-label={`${MODULE_LABELS[mod]} access`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODULE_ACCESS_LEVELS.map((lvl) => (
                  <SelectItem key={lvl} value={lvl}>
                    {LEVEL_LABELS[lvl]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </fieldset>
  );
}
