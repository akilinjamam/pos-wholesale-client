import { z } from 'zod';

/**
 * Mirrors the server's `auth.schema.ts`, deliberately kept loose.
 *
 * The client's job here is to catch the empty field and the obvious typo before a round trip —
 * not to re-implement the password policy. A client-side minimum length on *login* is actively
 * unhelpful: it rejects a legitimate older password the server would have accepted, and tells
 * an attacker the shape of what they are guessing.
 */
export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email').email('That does not look like an email'),
  password: z.string().min(1, 'Enter your password'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
