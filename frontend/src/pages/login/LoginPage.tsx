import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { message } from '@/components/ui/message';
import { useForm } from 'react-hook-form';
import { KeyRound, Languages, Lock, Moon, Sun, User } from 'lucide-react';
import type { TFunction } from 'i18next';
import type { z } from 'zod';

import { BrandManager, HttpUtil, LanguageManager } from '@/utils';
import { setMessageInstance } from '@/utils/messageBus';
import { pauseAnimationsUntilLeave, useTheme } from '@/hooks/useTheme';
import { LoginFormSchema, TwoFactorCodeSchema, type LoginFormValues } from '@/schemas/login';
import {
    Button,
    Card,
    CardContent,
    DropdownMenu,
    Input,
    Label,
    PasswordInput,
    Spinner
} from '@/components/ui';
import type { DropdownItem, InputProps } from '@/components/ui';

type LoginForm = LoginFormValues;

const basePath = window.Q_UI_BASE_PATH || '';

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

export default function LoginPage()
{
    const { t } = useTranslation();
    const { isDark, toggleTheme } = useTheme();
    const [messageApi] = message.useMessage();

    useEffect(() =>
    {
        setMessageInstance(messageApi);
    }, [messageApi]);

    const [fetched, setFetched] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [twoFactorEnable, setTwoFactorEnable] = useState(false);
    const [registrationEnable, setRegistrationEnable] = useState(false);
    const [brandTitle, setBrandTitle] = useState<string>(() => BrandManager.getTitle());
    const [brandLogo, setBrandLogo] = useState<string>('');
    const [lang, setLang] = useState<string>(() => LanguageManager.getLanguage());

    const {
        register,
        handleSubmit,
        formState: { errors }
    } = useForm<LoginForm>({
        defaultValues: { username: '', password: '', twoFactorCode: '' }
    });

    // Keep the workspace slug on the "create account" link so signup lands in the
    // same manager's tenant. Extracted from /tenant/<slug> path (replaces old ?ws=<slug> query).
    const registerHref = useMemo(() =>
    {
        const slug = window.location.pathname.match(/\/tenant\/([^/]+)/)?.[1];
        return slug
            ? (basePath || '/') + `tenant/${ encodeURIComponent(slug) }/register`
            : (basePath || '/') + 'register';
    }, []);

    useEffect(() =>
    {
        let cancelled = false;
        (async () =>
        {
            // The Manager workspace whose brand + registration flag apply on this
            // login screen: /tenant/<slug> path (carried from the foreign-workspace
            // login link), or the workspace this custom domain belongs to (window.Q_UI_WORKSPACE).
            const ws = window.location.pathname.match(/\/tenant\/([^/]+)/)?.[1]
                || window.Q_UI_WORKSPACE || '';
            const [twoFactor, workspace] = await Promise.all([
                HttpUtil.post('/getTwoFactorEnable', undefined, { silent: true }),
                HttpUtil.post('/getWorkspaceInfo', { slug: ws }, { silent: true })
            ]);
            if (cancelled)
            {
                return;
            }
            if (twoFactor.success)
            {
                setTwoFactorEnable(!!twoFactor.obj);
            }
            if (workspace.success && workspace.obj)
            {
                const info = workspace.obj as { title?: string; logo?: string; registrationEnable?: boolean };
                setRegistrationEnable(!!info.registrationEnable);
                if (info.title)
                {
                    setBrandTitle(BrandManager.setTitle(info.title));
                }
                setBrandLogo(info.logo || '');
            }
            setFetched(true);
        })();
        return () =>
        {
            cancelled = true;
        };
    }, []);

    const onSubmit = useCallback(async (values: LoginForm) =>
    {
        setSubmitting(true);
        try
        {
            // Per-workspace login: tell the backend which workspace's accounts to
            // authenticate against (the /tenant/<slug> path, or this custom domain's workspace).
            const urlWs = window.location.pathname.match(/\/tenant\/([^/]+)/)?.[1];
            const ws = urlWs || window.Q_UI_WORKSPACE || '';
            const msg = await HttpUtil.post('/login', { ...values, workspace: ws });
            if (msg.success)
            {
                // Land in the workspace just logged into (path-based); a custom
                // domain keeps its clean root.
                window.location.href = urlWs
                    ? `${ basePath }panel/manager/${ encodeURIComponent(urlWs) }/`
                    : basePath + 'panel/';
            }
        }
        finally
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
        pauseAnimationsUntilLeave('login-theme-cycle');
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
              id="login-theme-cycle"
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
            {!fetched ? (
              <Spinner className="h-8 w-8 text-accent" />
            ) : (
              <Card className="w-full max-w-md shadow-lg">
                <CardContent className="flex flex-col p-6 pt-6 sm:p-8">
                  <div className="flex flex-col items-center gap-2.5">
                    {brandLogo ? (
                      <img src={brandLogo} alt={brandTitle} className="h-12 max-w-[220px] object-contain" />
                    ) : (
                      <span className="text-2xl font-bold tracking-wide text-foreground">{brandTitle}</span>
                    )}
                    <span aria-hidden="true" className="h-[3px] w-10 rounded-full bg-accent" />
                  </div>

                  <form noValidate onSubmit={handleSubmit(onSubmit)} className="mt-8 flex flex-col gap-4">
                    <Field label={t('username')} htmlFor="login-username" error={errors.username?.message}>
                      <IconInput
                        id="login-username"
                        icon={<User className="h-4 w-4" aria-hidden />}
                        autoComplete="username"
                        placeholder={t('username')}
                        autoFocus
                        aria-invalid={!!errors.username}
                        {...register('username', { validate: zodValidate(LoginFormSchema.shape.username, t) })}
                      />
                    </Field>

                    <Field label={t('password')} htmlFor="login-password" error={errors.password?.message}>
                      <PasswordInput
                        id="login-password"
                        autoComplete="current-password"
                        placeholder={t('password')}
                        startIcon={<Lock aria-hidden />}
                        aria-invalid={!!errors.password}
                        {...register('password', { validate: zodValidate(LoginFormSchema.shape.password, t) })}
                      />
                    </Field>

                    {twoFactorEnable && (
                      <Field label={t('twoFactorCode')} htmlFor="login-2fa" error={errors.twoFactorCode?.message}>
                        <IconInput
                          id="login-2fa"
                          icon={<KeyRound className="h-4 w-4" aria-hidden />}
                          autoComplete="one-time-code"
                          placeholder={t('twoFactorCode')}
                          aria-invalid={!!errors.twoFactorCode}
                          {...register('twoFactorCode', { validate: zodValidate(TwoFactorCodeSchema, t) })}
                        />
                      </Field>
                    )}

                    <Button type="submit" size="lg" loading={submitting} className="mt-1 w-full">
                      {t('login')}
                    </Button>
                  </form>

                  {registrationEnable ? (
                    <div className="mt-4 text-center text-sm text-muted-foreground">
                      <span>{t('pages.login.noAccount')}</span>{' '}
                      <a href={registerHref} className="font-medium text-accent hover:underline">
                        {t('pages.login.createAccount')}
                      </a>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            )}
          </div>
    </div>
    );
}
