import { useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { message } from '@/components/ui/message';
import { Lock, Mail, User, Wallet } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/hooks/useTheme';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useMe, ME_QUERY_KEY } from '@/hooks/useMe';
import { useCurrency } from '@/hooks/useCurrency';
import { HttpUtil } from '@/utils';
import { setMessageInstance } from '@/utils/messageBus';
import PageShell from '@/layouts/PageShell';
import {
    Badge,
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Input,
    Label,
    PasswordInput
} from '@/components/ui';
import type { BadgeVariant } from '@/components/ui';

const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } } as const;
const basePath = window.Q_UI_BASE_PATH || '/';

interface ProfileFormValues {
  username: string;
  email: string;
  newPassword: string;
  confirmPassword: string;
  currentPassword: string;
}

const ROLE_BADGE: Record<string, BadgeVariant> = {
    admin: 'warning',
    manager: 'primary',
    reseller: 'neutral',
    member: 'success'
};

// One labelled form row: label, control, optional hint + validation error.
function Field({
    label,
    htmlFor,
    hint,
    error,
    children
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
})
{
    return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <span className="text-xs text-danger">{error}</span>
      ) : hint ? (
        <span className="text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </div>
    );
}

export default function ProfilePage()
{
    usePageTitle();
    const { t } = useTranslation();
    const { isDark } = useTheme();
    const { me } = useMe();
    const { unit, formatNumber } = useCurrency();
    const [messageApi] = message.useMessage();
    useEffect(() =>
    {
        setMessageInstance(messageApi);
    }, [messageApi]);
    const queryClient = useQueryClient();

    const {
        register,
        handleSubmit,
        setValue,
        getValues,
        formState: { errors }
    } = useForm<ProfileFormValues>({
        defaultValues: { username: '', email: '', newPassword: '', confirmPassword: '', currentPassword: '' }
    });

    useEffect(() =>
    {
        if (me)
        {
            setValue('username', me.username);
            setValue('email', me.email ?? '');
        }
    }, [me, setValue]);

    const saveMut = useMutation({
        mutationFn: (values: ProfileFormValues) =>
            HttpUtil.post(
                '/panel/api/profile',
                {
                    currentPassword: values.currentPassword,
                    username: values.username,
                    email: values.email ?? '',
                    newPassword: values.newPassword ?? ''
                },
                JSON_HEADERS
            ),
        onSuccess: (msg) =>
        {
            if (!msg?.success)
            {
                return;
            }
            const passwordChanged = !!(msg.obj as { passwordChanged?: boolean } | null)?.passwordChanged;
            if (passwordChanged)
            {
                messageApi.success(t('pages.profile.toasts.passwordChanged'));
                window.setTimeout(() =>
                {
                    window.location.href = basePath;
                }, 1200);
            }
            else
            {
                messageApi.success(t('pages.profile.toasts.saved'));
                setValue('currentPassword', '');
                setValue('newPassword', '');
                setValue('confirmPassword', '');
                queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
            }
        }
    });

    const onSubmit = handleSubmit((values) => saveMut.mutateAsync(values));

    const role = (me?.role || 'member').toLowerCase();

    const pageClass = useMemo(() => `profile-page${ isDark ? ' is-dark' : '' }`, [isDark]);

    return (
    <PageShell name={pageClass}>
            <div className="flex w-full flex-col gap-4">
              {/* Balance + role */}
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-4 p-5">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface-sunken text-muted-foreground">
                      <Wallet className="h-5 w-5" aria-hidden />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-muted-foreground">{t('balance')}</span>
                      <span className="text-2xl font-bold tabular-nums">
                        {formatNumber(me?.balance ?? 0)}{' '}
                        <span className="text-base font-medium text-muted-foreground">{unit}</span>
                      </span>
                    </div>
                  </div>
                  <Badge variant={ROLE_BADGE[role] ?? 'neutral'}>{t(`pages.users.role_${ role }`)}</Badge>
                </div>
              </Card>

              {/* Account form */}
              <Card>
                <CardHeader>
                  <CardTitle>{t('pages.profile.accountTitle')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
                    <Field label={t('username')} htmlFor="pf-username" error={errors.username?.message}>
                      <Input
                        id="pf-username"
                        autoComplete="username"
                        startIcon={<User aria-hidden />}
                        aria-invalid={!!errors.username}
                        {...register('username', {
                            required: t('pages.register.errors.username'),
                            pattern: { value: /^[A-Za-z0-9_]{3,32}$/, message: t('pages.register.errors.username') }
                        })}
                      />
                    </Field>

                    <Field label={t('emailAddress')} htmlFor="pf-email">
                      <Input
                        id="pf-email"
                        autoComplete="email"
                        startIcon={<Mail aria-hidden />}
                        placeholder={t('pages.register.placeholders.email')}
                        {...register('email')}
                      />
                    </Field>

                    <div className="mt-2 border-t border-border pt-4">
                      <h3 className="text-sm font-semibold text-foreground">{t('pages.profile.changePassword')}</h3>
                    </div>

                    <Field
                      label={t('pages.profile.newPassword')}
                      htmlFor="pf-new"
                      hint={t('pages.profile.newPasswordHint')}
                      error={errors.newPassword?.message}
                    >
                      <PasswordInput
                        id="pf-new"
                        autoComplete="new-password"
                        startIcon={<Lock aria-hidden />}
                        aria-invalid={!!errors.newPassword}
                        {...register('newPassword', {
                            validate: (v) => !v || v.length >= 8 || t('pages.register.errors.password')
                        })}
                      />
                    </Field>

                    <Field
                      label={t('confirmPassword')}
                      htmlFor="pf-confirm"
                      error={errors.confirmPassword?.message}
                    >
                      <PasswordInput
                        id="pf-confirm"
                        autoComplete="new-password"
                        startIcon={<Lock aria-hidden />}
                        aria-invalid={!!errors.confirmPassword}
                        {...register('confirmPassword', {
                            validate: (v) =>
                            {
                                const np = getValues('newPassword');
                                return !np || np === v || t('pages.register.errors.confirmPassword');
                            }
                        })}
                      />
                    </Field>

                    <Field
                      label={t('pages.profile.currentPassword')}
                      htmlFor="pf-current"
                      hint={t('pages.profile.currentPasswordHint')}
                      error={errors.currentPassword?.message}
                    >
                      <PasswordInput
                        id="pf-current"
                        autoComplete="current-password"
                        startIcon={<Lock aria-hidden />}
                        aria-invalid={!!errors.currentPassword}
                        {...register('currentPassword', {
                            required: t('pages.profile.currentPasswordRequired')
                        })}
                      />
                    </Field>

                    <Button type="submit" loading={saveMut.isPending} className="mt-1 w-full sm:w-auto sm:self-start">
                      {t('save')}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
    </PageShell>
    );
}
