// Account (Part H): profile, tour state, deleting the account, feedback.
import { z } from 'zod';

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, 'Add your name').max(80).optional(),
  /** E.164, e.g. +919876543210; null clears it. */
  phone: z.union([z.string().trim().regex(/^\+[1-9]\d{6,14}$/, 'Use the international format, like +919876543210'), z.null()]).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
}).strict();
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const tourUpdateSchema = z.object({
  seen: z.array(z.string().regex(/^[a-z0-9-]{2,40}$/)).max(20).optional(),
  dismissed: z.boolean().optional(),
  reset: z.boolean().optional(),
}).strict();

export const deleteConfirmSchema = z.object({
  otp: z.string().trim().regex(/^\d{6}$/, 'The code is 6 digits'),
  /** Typed by the user: DELETE. */
  confirm: z.literal('DELETE'),
}).strict();

export const feedbackSchema = z.object({
  kind: z.enum(['bug', 'feedback', 'question']),
  message: z.string().trim().min(5, 'Tell us a little more').max(4000),
  page: z.string().trim().max(200).optional(),
}).strict();
export type FeedbackInput = z.infer<typeof feedbackSchema>;

export const feedbackStatusSchema = z.object({ status: z.enum(['new', 'read', 'done']) }).strict();
