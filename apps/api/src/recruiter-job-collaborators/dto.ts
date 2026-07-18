import { z } from 'zod';

// Add a teammate as a collaborator on a job. `userId` is the collaborator's
// User id (a recruiter in the same company). The owner is resolved from the JWT.
export const AddCollaboratorDto = z
  .object({
    userId: z.number().int().positive(),
  })
  .strict();
export type AddCollaboratorInput = z.infer<typeof AddCollaboratorDto>;
