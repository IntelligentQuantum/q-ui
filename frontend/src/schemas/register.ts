import { z } from 'zod';

// Field-level schemas mirror the server-side rules in web/service/user.go so
// client and server validation agree. Messages are i18n keys resolved by the
// `antdRule` adapter at validation time.
export const FullNameSchema = z
    .string()
    .trim()
    .min(2, 'pages.register.errors.fullName')
    .max(100, 'pages.register.errors.fullName');

// Optional leading +, then a digit, then 4-19 digits/separators.
export const PhoneSchema = z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9 ()\-.]{4,19}$/, 'pages.register.errors.phone');

export const EmailSchema = z
    .string()
    .trim()
    .max(254, 'pages.register.errors.email')
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'pages.register.errors.email');

export const UsernameSchema = z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_]{3,32}$/, 'pages.register.errors.username');

// Simple password rule: a minimum length only (mirrors the backend's
// minPasswordLen). The previous upper/lower/digit complexity requirement was
// removed in favour of this simpler policy.
export const PasswordSchema = z.string().min(6, 'pages.register.errors.password');

export interface RegisterFormValues {
  fullName: string;
  phone: string;
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
}
