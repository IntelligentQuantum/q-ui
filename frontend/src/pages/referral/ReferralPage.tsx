import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { message } from '@/components/ui/message';
import { useQuery } from '@tanstack/react-query';
import { BadgePercent, Check, Coins, Copy, Link2, Share2, ShoppingBag, UserCheck, Users, Wallet } from 'lucide-react';

import { usePageTitle } from '@/hooks/usePageTitle';
import { HttpUtil } from '@/utils';
import PageShell from '@/layouts/PageShell';
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Input, Skeleton, StatCard } from '@/components/ui';

interface ReferralStats {
  totalReferrals: number;
  registeredUsers: number;
  activeUsers: number;
  purchasedUsers: number;
  revenue: number;
}

interface ReferralMe {
  code: string;
  enabled: boolean;
  isReseller: boolean;
  registerPath: string;
  stats: ReferralStats;
  commissionPercent: number;
  commissionEarned: number;
}

const basePath = window.Q_UI_BASE_PATH || '/';

export default function ReferralPage()
{
    const { t } = useTranslation();
    usePageTitle();
    const [messageApi] = message.useMessage();
    const [copied, setCopied] = useState(false);

    const { data, isLoading, isError } = useQuery<ReferralMe>({
        queryKey: ['referral', 'me'],
        queryFn: async () =>
        {
            const res = await HttpUtil.get('/panel/api/referral/me');
            if (!res.success)
            {
                throw new Error(res.msg || 'failed');
            }
            return res.obj as ReferralMe;
        }
    });

    const link = useMemo(() =>
    {
        if (!data?.registerPath)
        {
            return '';
        }
        return `${window.location.origin}${basePath}${data.registerPath}`;
    }, [data?.registerPath]);

    const copyLink = async () =>
    {
        if (!link)
        {
            return;
        }
        try
        {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            messageApi.success(t('pages.referral.copied', { defaultValue: 'Referral link copied' }));
            window.setTimeout(() => setCopied(false), 1500);
        }
        catch
        {
            messageApi.error(t('pages.referral.copyFailed', { defaultValue: 'Could not copy link' }));
        }
    };

    const stats = data?.stats;

    return (
    <PageShell name="referral-page">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <Share2 className="h-6 w-6" aria-hidden />
            {t('pages.referral.title', { defaultValue: 'Referrals' })}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('pages.referral.subtitle', {
                defaultValue: 'Invite new users with your personal link. Anyone who signs up through it is credited to you for 90 days.'
            })}
          </p>
        </div>

        {/* Share link */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-4 w-4" aria-hidden />
              {t('pages.referral.yourLink', { defaultValue: 'Your referral link' })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : isError ? (
              <Alert variant="danger">{t('pages.referral.loadError', { defaultValue: 'Could not load your referral info.' })}</Alert>
            ) : data && !data.isReseller ? (
              <Alert variant="info">
                {t('pages.referral.notReseller', { defaultValue: 'Referral links are available to reseller accounts.' })}
              </Alert>
            ) : data && !data.enabled ? (
              <Alert variant="warning">
                {t('pages.referral.disabled', { defaultValue: 'Your referral code is currently disabled. Contact an administrator.' })}
              </Alert>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Input readOnly value={link} aria-label={t('pages.referral.yourLink', { defaultValue: 'Your referral link' })} className="font-mono text-sm" />
                <Button onClick={copyLink} className="shrink-0 gap-2">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied
                      ? t('pages.referral.copiedShort', { defaultValue: 'Copied' })
                      : t('pages.referral.copy', { defaultValue: 'Copy' })}
                </Button>
              </div>
            )}
            {data?.code ? (
              <p className="mt-3 text-xs text-muted-foreground">
                {t('pages.referral.codeLabel', { defaultValue: 'Code' })}:{' '}
                <span className="font-mono font-medium text-foreground">{data.code}</span>
              </p>
            ) : null}
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {isLoading || !stats ? (
            Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-[72px] w-full rounded-xl" />)
          ) : (
            <>
              <StatCard icon={<Users className="h-5 w-5" />} label={t('pages.referral.totalReferrals', { defaultValue: 'Total referrals' })} value={stats.totalReferrals} />
              <StatCard icon={<UserCheck className="h-5 w-5" />} label={t('pages.referral.registered', { defaultValue: 'Registered users' })} value={stats.registeredUsers} />
              <StatCard icon={<Share2 className="h-5 w-5" />} label={t('pages.referral.active', { defaultValue: 'Active users' })} value={stats.activeUsers} />
              <StatCard icon={<ShoppingBag className="h-5 w-5" />} label={t('pages.referral.purchased', { defaultValue: 'Purchased users' })} value={stats.purchasedUsers} />
              <StatCard icon={<Wallet className="h-5 w-5" />} label={t('pages.referral.revenue', { defaultValue: 'Generated revenue' })} value={stats.revenue.toLocaleString()} />
              <StatCard icon={<BadgePercent className="h-5 w-5" />} label={t('pages.referral.commissionRate', { defaultValue: 'Commission rate' })} value={`${data?.commissionPercent ?? 0}%`} />
              <StatCard icon={<Coins className="h-5 w-5 text-success" />} label={t('pages.referral.earned', { defaultValue: 'Commission earned' })} value={(data?.commissionEarned ?? 0).toLocaleString()} />
            </>
          )}
        </div>
      </div>
    </PageShell>
    );
}
