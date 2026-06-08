import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { message } from '@/components/ui/message';
import { useForm } from 'react-hook-form';
import { Languages, Lock, Mail, Moon, Phone, Sun, User } from 'lucide-react';
import type { TFunction } from 'i18next';
import type { z } from 'zod';

import { HttpUtil, LanguageManager } from '@/utils';
import { setMessageInstance } from '@/utils/messageBus';
import { pauseAnimationsUntilLeave, useTheme } from '@/hooks/useTheme';
import {
    EmailSchema,
    FullNameSchema,
    PasswordSchema,
    PhoneSchema,
    UsernameSchema,
    type RegisterFormValues
} from '@/schemas/register';
import {
    Button,
    Card,
    CardContent,
    DropdownMenu,
    Input,
    Label,
    PasswordInput
} from '@/components/ui';
import type { DropdownItem, InputProps } from '@/components/ui';

const basePath = window.Q_UI_BASE_PATH || '';
const REDIRECT_DELAY_MS = 1200;

// Convert a zod field schema (whose messages are i18n keys) into an RHF
// `validate` function — preserves the exact rules + message keys the old
// antdRule adapter used.
function zodValidate<T extends z.ZodType>(schema: T, t: TFunction)
{
    return (value: unknown) =>
    {
        const result = schema.safeParse(value);
        if (result.success)
        {
            return true;
        }
        const key = result.error.issues[0]?.message ?? 'validation.invalid';
        return t(key, { defaultValue: key });
    };
}

// One labelled form row: label, control, validation error.
function Field({
    label,
    htmlFor,
    error,
    children
}: {
  label: ReactNode;
  htmlFor: string;
  error?: string;
  children: ReactNode;
})
{
    return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </div>
    );
}

// Text input with an inline leading icon at the inline-start, RTL-safe.
function IconInput({ icon, ...props }: { icon: ReactNode } & InputProps)
{
    return <Input startIcon={icon} {...props} />;
}

export default function RegisterPage()
{
    const { t } = useTranslation();
    const { isDark, toggleTheme } = useTheme();
    const [messageApi] = message.useMessage();

    useEffect(() =>
    {
        setMessageInstance(messageApi);
    }, [messageApi]);

    const [submitting, setSubmitting] = useState(false);
    const [lang, setLang] = useState<string>(() => LanguageManager.getLanguage());

    const {
        register,
        handleSubmit,
        getValues,
        formState: { errors }
    } = useForm<RegisterFormValues>({
        defaultValues: {
            fullName: '',
            phone: '',
            email: '',
            username: '',
            password: '',
            confirmPassword: ''
        }
    });

    // When registration is disabled the server never serves this page, but the
    // Vite dev server serves it statically — guard here too so the dev flow and
    // any cached page redirect to login.
    useEffect(() =>
    {
        let cancelled = false;
        (async () =>
        {
            const msg = await HttpUtil.post('/getRegistrationEnable', undefined, { silent: true });
            if (cancelled)
            {
                return;
            }
            if (!(msg.success && msg.obj))
            {
                window.location.replace(basePath || '/');
            }
        })();
        return () =>
        {
            cancelled = true;
        };
    }, []);

    const onSubmit = useCallback(async (values: RegisterFormValues) =>
    {
        setSubmitting(true);
        try
        {
            const payload = {
                fullName: values.fullName.trim(),
                phone: values.phone.trim(),
                email: values.email.trim(),
                username: values.username.trim(),
                password: values.password,
                confirmPassword: values.confirmPassword
            };
            const msg = await HttpUtil.post('/register', payload);
            if (msg.success)
            {
                window.setTimeout(() =>
                {
                    window.location.href = basePath || '/';
                }, REDIRECT_DELAY_MS);
            }
            else
            {
                setSubmitting(false);
            }
        }
        catch
        {
            setSubmitting(false);
        }
    }, []);

    const onLangChange = useCallback((next: string) =>
    {
        setLang(next);
        LanguageManager.setLanguage(next);
    }, []);

    const cycleTheme = useCallback(() =>
    {
        pauseAnimationsUntilLeave('register-theme-cycle');
        toggleTheme();
    }, [toggleTheme]);

    const langItems = useMemo<DropdownItem[]>(
        () => (LanguageManager.supportedLanguages as { value: string; name: string; icon: string }[]).map((l) => ({
            key: l.value,
            label: (
        <span className="flex items-center gap-2">
          <span aria-hidden="true">{l.icon}</span>
          <span>{l.name}</span>
          {l.value === lang ? <span className="ms-auto text-accent">•</span> : null}
        </span>
            ),
            onSelect: () => onLangChange(l.value)
        })),
        [lang, onLangChange]
    );

    return (
    <div className="relative min-h-screen overflow-hidden bg-background">
          {/* single, very subtle accent glow */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 -z-0 mx-auto h-[420px] w-[420px] max-w-full rounded-full bg-accent/15 blur-[120px]"
          />

          <div className="absolute end-4 top-4 z-10 flex items-center gap-2">
            <Button
              id="register-theme-cycle"
              variant="secondary"
              size="icon"
              className="rounded-full"
              aria-label={t('menu.theme')}
              title={t('menu.theme')}
              onClick={cycleTheme}
            >
              {isDark ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
            </Button>
            <DropdownMenu
              align="end"
              label={t('pages.settings.language')}
              items={langItems}
              trigger={<Languages className="h-[18px] w-[18px]" aria-hidden />}
            />
          </div>

          <div className="relative z-[1] flex min-h-screen items-center justify-center p-4 sm:p-6">
            <Card className="w-full max-w-md shadow-lg">
              <CardContent className="flex flex-col p-6 pt-6 sm:p-8">
                <div className="flex flex-col items-center gap-2.5">
                  <span className="text-2xl font-bold tracking-wide text-foreground">Q-UI</span>
                  <span aria-hidden="true" className="h-[3px] w-10 rounded-full bg-accent" />
                </div>

                <h2 className="mt-3 text-center text-2xl font-bold leading-tight text-foreground">
                  {t('pages.register.title')}
                </h2>
                <p className="mb-6 mt-1 text-center text-sm text-muted-foreground">
                  {t('pages.register.subtitle')}
                </p>

                <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
                  <Field label={t('fullName')} htmlFor="reg-fullName" error={errors.fullName?.message}>
                    <IconInput
                      id="reg-fullName"
                      icon={<User className="h-4 w-4" aria-hidden />}
                      autoComplete="name"
                      placeholder={t('pages.register.placeholders.fullName')}
                      autoFocus
                      aria-invalid={!!errors.fullName}
                      {...register('fullName', { validate: zodValidate(FullNameSchema, t) })}
                    />
                  </Field>

                  <Field label={t('phoneNumber')} htmlFor="reg-phone" error={errors.phone?.message}>
                    <IconInput
                      id="reg-phone"
                      icon={<Phone className="h-4 w-4" aria-hidden />}
                      autoComplete="tel"
                      inputMode="tel"
                      placeholder={t('pages.register.placeholders.phone')}
                      aria-invalid={!!errors.phone}
                      {...register('phone', { validate: zodValidate(PhoneSchema, t) })}
                    />
                  </Field>

                  <Field label={t('email')} htmlFor="reg-email" error={errors.email?.message}>
                    <IconInput
                      id="reg-email"
                      icon={<Mail className="h-4 w-4" aria-hidden />}
                      autoComplete="email"
                      inputMode="email"
                      placeholder={t('pages.register.placeholders.email')}
                      aria-invalid={!!errors.email}
                      {...register('email', { validate: zodValidate(EmailSchema, t) })}
                    />
                  </Field>

                  <Field label={t('username')} htmlFor="reg-username" error={errors.username?.message}>
                    <IconInput
                      id="reg-username"
                      icon={<User className="h-4 w-4" aria-hidden />}
                      autoComplete="username"
                      placeholder={t('pages.register.placeholders.username')}
                      aria-invalid={!!errors.username}
                      {...register('username', { validate: zodValidate(UsernameSchema, t) })}
                    />
                  </Field>

                  <Field label={t('password')} htmlFor="reg-password" error={errors.password?.message}>
                    <PasswordInput
                      id="reg-password"
                      autoComplete="new-password"
                      placeholder={t('pages.register.placeholders.password')}
                      startIcon={<Lock aria-hidden />}
                      aria-invalid={!!errors.password}
                      {...register('password', { validate: zodValidate(PasswordSchema, t) })}
                    />
                  </Field>

                  <Field
                    label={t('confirmPassword')}
                    htmlFor="reg-confirmPassword"
                    error={errors.confirmPassword?.message}
                  >
                    <PasswordInput
                      id="reg-confirmPassword"
                      autoComplete="new-password"
                      placeholder={t('pages.register.placeholders.confirmPassword')}
                      startIcon={<Lock aria-hidden />}
                      aria-invalid={!!errors.confirmPassword}
                      {...register('confirmPassword', {
                          validate: (value) =>
                          {
                              if (!value || getValues('password') === value)
                              {
                                  return true;
                              }
                              return t('pages.register.errors.confirmPassword');
                          },
                          required: t('pages.register.errors.confirmPassword')
                      })}
                    />
                  </Field>

                  <Button type="submit" size="lg" loading={submitting} className="mt-1 w-full">
                    {t('pages.register.submit')}
                  </Button>
                </form>

                <div className="mt-4 text-center text-sm text-muted-foreground">
                  <span>{t('pages.register.haveAccount')}</span>{' '}
                  <a href={basePath || '/'} className="font-medium text-accent hover:underline">
                    {t('pages.register.backToLogin')}
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>
    </div>
    );
}
