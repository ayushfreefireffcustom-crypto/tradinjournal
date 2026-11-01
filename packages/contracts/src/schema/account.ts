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

// ── Marketplace (H1–H3) ──
export const creatorApplySchema = z.object({
  displayName: z.string().trim().min(2).max(40),
  bio: z.string().trim().min(20, 'Tell traders a little about how you trade (20+ characters)').max(1000),
  experience: z.string().trim().max(500).optional(),
  links: z.array(z.string().trim().url().max(200)).max(5).optional(),
}).strict();

const templateParamSchema = z.object({ id: z.string().min(3).max(120), label: z.string().trim().max(60).optional(), min: z.number(), max: z.number(), step: z.number().positive() }).strict();
export const templateCreateSchema = z.object({
  strategyId: z.string().min(1).max(40),
  name: z.string().trim().min(3).max(60),
  summary: z.string().trim().min(10).max(160),
  description: z.string().trim().min(30, 'Describe the idea, when it works and when it doesn’t (30+ characters)').max(4000),
  category: z.enum(['trend', 'reversion', 'breakout', 'momentum', 'range', 'scalping']),
  risk: z.enum(['low', 'medium', 'high']),
  params: z.array(templateParamSchema).max(8),
  exchanges: z.array(z.enum(['delta_india', 'binance', 'bybit'])).max(3),
  trackDeploymentId: z.string().min(1).max(40).nullable().optional(),
}).strict();
export const templateUpdateSchema = templateCreateSchema.omit({ strategyId: true }).partial().extend({ refreshRules: z.boolean().optional() }).strict();

export const subscribeSchema = z.object({
  mode: z.enum(['paper', 'live']),
  capital: z.number().min(100).max(100_000_000).optional(),
  connectionId: z.string().min(1).max(64).optional(),
  confirmLive: z.boolean().optional(),
  params: z.record(z.string().max(120), z.number()).optional(),
}).strict();

export const reviewSchema = z.object({ decision: z.string().min(3).max(20), note: z.string().trim().max(500).optional() }).strict();
