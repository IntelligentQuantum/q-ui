import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCode } from '@/components/ui';
import { message } from '@/components/ui/message';
import { Apple, ChevronDown, Copy, Languages, Moon, QrCode, Smartphone, Sun } from 'lucide-react';

import { ClipboardManager, IntlUtil, LanguageManager } from '@/utils';
import { isPostQuantumLink } from '@/lib/xray/inbound-link';
import { LinkTags, parseLinkParts } from '@/lib/xray/link-label';
import { setMessageInstance } from '@/utils/messageBus';
import { pauseAnimationsUntilLeave, useTheme } from '@/hooks/useTheme';
import {
    Badge,
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    DropdownMenu,
    Modal,
    Tooltip,
    cn
} from '@/components/ui';
import SubUsageSummary from './SubUsageSummary';

const QR_SIZE = 240;

const subData = window.__SUB_PAGE_DATA__ || {};

const sId = subData.sId || '';
const enabled = !!subData.enabled;
const download = subData.download || '0';
const upload = subData.upload || '0';
const total = subData.total || '∞';
const used = subData.used || '0';
const remained = subData.remained || '';
const totalByte = Number(subData.totalByte || 0);
const expireMs = Number(subData.expire || 0) * 1000;
const lastOnlineMs = Number(subData.lastOnline || 0);
const subUrl = subData.subUrl || '';
const subJsonUrl = subData.subJsonUrl || '';
const subClashUrl = subData.subClashUrl || '';
const subTitle = subData.subTitle || '';
const links: string[] = Array.isArray(subData.links) ? subData.links : [];
const linkEmails: string[] = Array.isArray(subData.emails) ? subData.emails : [];
const datepicker = subData.datepicker || 'gregorian';

// Style the DropdownMenu's built-in trigger button as a full-width primary
// button (the trigger styling is internal, so override it via a child variant).
const appDropdownClass = cn(
    'w-full',
    '[&>button]:w-full [&>button]:!h-11 [&>button]:!px-4',
    '[&>button]:!bg-primary [&>button]:!text-primary-foreground',
    '[&>button]:hover:!bg-primary-hover [&>button]:hover:!text-primary-foreground'
);

const isUnlimited = totalByte <= 0 && expireMs === 0;
const isActive = (() =>
{
    if (!enabled)
    {
        return false;
    }
    if (totalByte > 0)
    {
        const usedByteCalc = Number(subData.usedByte || 0)
      || (Number(subData.downloadByte || 0) + Number(subData.uploadByte || 0));
        if (usedByteCalc >= totalByte)
        {
            return false;
        }
    }
    if (expireMs > 0 && Date.now() >= expireMs)
    {
        return false;
    }
    return true;
})();

interface QrState {
  value: string;
  label: ReactNode;
}

// One definition-list row inside the info card.
function InfoRow({ label, children }: { label: ReactNode; children: ReactNode })
{
    return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-end font-medium text-foreground tabular-nums">{children}</dd>
    </div>
    );
}

// A single share/sub link row: tag(s) + name + copy/QR actions.
function LinkRow({
    tags,
    href,
    title,
    rowTitle,
    onCopy,
    onQr,
    copyLabel
}: {
  tags: ReactNode;
  href?: string;
  title?: string;
  rowTitle: ReactNode;
  onCopy: () => void;
  onQr?: () => void;
  copyLabel: string;
})
{
    return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-foreground/[0.02] px-3 py-2 transition-colors hover:bg-foreground/[0.04]">
      {tags}
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title={title}
          className="min-w-0 flex-1 truncate text-sm text-foreground hover:text-accent hover:underline"
        >
          {rowTitle}
        </a>
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm text-foreground" title={title}>
          {rowTitle}
        </span>
      )}
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="secondary" size="icon" onClick={onCopy} aria-label={copyLabel} title={copyLabel}>
          <Copy className="h-4 w-4" aria-hidden />
        </Button>
        {onQr && (
          <Button variant="secondary" size="icon" onClick={onQr} aria-label="QR" title="QR">
            <QrCode className="h-4 w-4" aria-hidden />
          </Button>
        )}
      </div>
    </div>
    );
}

// Hairline-bordered section heading (replaces AntD <Divider/>).
function SectionTitle({ children }: { children: ReactNode })
{
    return (
    <div className="my-5 flex items-center gap-3">
      <span className="h-px flex-1 bg-border" />
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
    );
}

export default function SubPage()
{
    const { t } = useTranslation();
    const { isDark, toggleTheme } = useTheme();
    const [messageApi] = message.useMessage();
    useEffect(() =>
    {
        setMessageInstance(messageApi);
    }, [messageApi]);

    const [lang, setLang] = useState<string>(() => LanguageManager.getLanguage());
    const [qr, setQr] = useState<QrState | null>(null);

    const onLangChange = useCallback((next: string) =>
    {
        setLang(next);
        LanguageManager.setLanguage(next);
    }, []);

    const cycleTheme = useCallback(() =>
    {
        pauseAnimationsUntilLeave('sub-theme-cycle');
        toggleTheme();
    }, [toggleTheme]);

    const copy = useCallback(async (value: string) =>
    {
        if (!value)
        {
            return;
        }
        const ok = await ClipboardManager.copyText(value);
        if (ok)
        {
            messageApi.success(t('copied'));
        }
    }, [t, messageApi]);

    const open = useCallback((url: string) =>
    {
        if (!url)
        {
            return;
        }
        window.open(url, '_blank');
    }, []);

    const shadowrocketUrl = useMemo(() =>
    {
        if (!subUrl)
        {
            return '';
        }
        const separator = subUrl.includes('?') ? '&' : '?';
        const rawUrl = subUrl + separator + 'flag=shadowrocket';
        const base64Url = btoa(rawUrl);
        const remark = encodeURIComponent(subTitle || sId || 'Subscription');
        return `shadowrocket://add/sub/${ base64Url }?remark=${ remark }`;
    }, []);

    const v2boxUrl = useMemo(
        () => `v2box://install-sub?url=${ encodeURIComponent(subUrl) }&name=${ encodeURIComponent(sId) }`,
        []
    );
    const streisandUrl = useMemo(() => `streisand://import/${ encodeURIComponent(subUrl) }`, []);
    const happUrl = useMemo(() => `happ://add/${ subUrl }`, []);

    const statusBadge = useMemo(() =>
    {
        if (!enabled)
        {
            return <Badge variant="danger">{t('subscription.inactive')}</Badge>;
        }
        if (isUnlimited)
        {
            return <Badge variant="primary">{t('subscription.unlimited')}</Badge>;
        }
        return (
      <Badge variant={isActive ? 'success' : 'danger'}>
        {isActive ? t('subscription.active') : t('subscription.inactive')}
      </Badge>
        );
    }, [t]);

    const infoRows = useMemo(() =>
    {
        const rows: { key: string; label: string; children: ReactNode }[] = [
            { key: 'subId', label: t('subscription.subId'), children: sId },
            { key: 'status', label: t('subscription.status'), children: statusBadge },
            { key: 'down', label: t('subscription.downloaded'), children: download },
            { key: 'up', label: t('subscription.uploaded'), children: upload },
            { key: 'used', label: t('usage'), children: used },
            { key: 'total', label: t('subscription.totalQuota'), children: total }
        ];
        if (totalByte > 0)
        {
            rows.push({ key: 'remained', label: t('remained'), children: remained });
        }
        rows.push({
            key: 'lastOnline',
            label: t('lastOnline'),
            children: lastOnlineMs > 0 ? IntlUtil.formatDate(lastOnlineMs, datepicker) : '-'
        });
        rows.push({
            key: 'expiry',
            label: t('subscription.expiry'),
            children: expireMs === 0 ? t('subscription.noExpiry') : IntlUtil.formatDate(expireMs, datepicker)
        });
        return rows;
    }, [t, statusBadge]);

    const androidMenuItems = useMemo(() => [
        {
            key: 'android-v2box',
            label: 'V2Box',
            onSelect: () => open(`v2box://install-sub?url=${ encodeURIComponent(subUrl) }&name=${ encodeURIComponent(sId) }`)
        },
        {
            key: 'android-v2rayng',
            label: 'V2RayNG',
            onSelect: () => open(`v2rayng://install-config?url=${ encodeURIComponent(subUrl) }`)
        },
        { key: 'android-singbox', label: 'Sing-box', onSelect: () => copy(subUrl) },
        { key: 'android-v2raytun', label: 'V2RayTun', onSelect: () => copy(subUrl) },
        { key: 'android-npvtunnel', label: 'NPV Tunnel', onSelect: () => copy(subUrl) },
        { key: 'android-happ', label: 'Happ', onSelect: () => open(`happ://add/${ subUrl }`) }
    ], [copy, open]);

    const iosMenuItems = useMemo(() => [
        { key: 'ios-shadowrocket', label: 'Shadowrocket', onSelect: () => open(shadowrocketUrl) },
        { key: 'ios-v2box', label: 'V2Box', onSelect: () => open(v2boxUrl) },
        { key: 'ios-streisand', label: 'Streisand', onSelect: () => open(streisandUrl) },
        { key: 'ios-v2raytun', label: 'V2RayTun', onSelect: () => copy(subUrl) },
        { key: 'ios-npvtunnel', label: 'NPV Tunnel', onSelect: () => copy(subUrl) },
        { key: 'ios-happ', label: 'Happ', onSelect: () => open(happUrl) }
    ], [copy, open, shadowrocketUrl, v2boxUrl, streisandUrl, happUrl]);

    const langMenuItems = useMemo(
        () => (LanguageManager.supportedLanguages as { value: string; name: string; icon: string }[]).map((l) => ({
            key: l.value,
            label: (
        <span className={cn('flex items-center gap-2', l.value === lang && 'font-semibold text-accent')}>
          <span aria-hidden="true">{l.icon}</span>
          <span>{l.name}</span>
        </span>
            ),
            onSelect: () => onLangChange(l.value)
        })),
        [lang, onLangChange]
    );

    return (
    <div className="min-h-screen bg-background">
          <div className="mx-auto w-full max-w-2xl px-3 py-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{t('subscription.title')}</span>
                    <Badge variant="neutral" className="shrink-0">{sId}</Badge>
                  </CardTitle>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('menu.theme')}
                      title={t('menu.theme')}
                      onClick={cycleTheme}
                    >
                      {isDark ? <Moon className="h-5 w-5" aria-hidden /> : <Sun className="h-5 w-5" aria-hidden />}
                    </Button>
                    <DropdownMenu
                      align="end"
                      label={t('pages.settings.language')}
                      items={langMenuItems}
                      trigger={<Languages className="h-5 w-5" aria-hidden />}
                    />
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                {/* Info definition list */}
                <dl className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
                  {infoRows.map((row) => (
                    <InfoRow key={row.key} label={row.label}>
                      {row.children}
                    </InfoRow>
                  ))}
                </dl>

                <SubUsageSummary
                  usedByte={Number(subData.usedByte || 0)
                    || (Number(subData.downloadByte || 0) + Number(subData.uploadByte || 0))}
                  totalByte={totalByte}
                  usedLabel={used}
                  totalLabel={total}
                  remainedLabel={remained}
                  expireMs={expireMs}
                  isActive={isActive}
                />

                {(subUrl || subJsonUrl || subClashUrl) && (
                  <>
                    <SectionTitle>{t('subscription.title')}</SectionTitle>
                    <div className="flex flex-col gap-2">
                      {subUrl && (
                        <LinkRow
                          tags={<Badge variant="success" className="shrink-0 font-semibold tracking-wide">SUB</Badge>}
                          href={subUrl}
                          title={subUrl}
                          rowTitle={sId}
                          copyLabel={t('copy')}
                          onCopy={() => copy(subUrl)}
                          onQr={() => setQr({
                              value: subUrl,
                              label: <Badge variant="success">{t('pages.settings.subSettings')}</Badge>
                          })}
                        />
                      )}
                      {subJsonUrl && (
                        <LinkRow
                          tags={<Badge variant="primary" className="shrink-0 font-semibold tracking-wide">JSON</Badge>}
                          href={subJsonUrl}
                          title={subJsonUrl}
                          rowTitle={sId}
                          copyLabel={t('copy')}
                          onCopy={() => copy(subJsonUrl)}
                          onQr={() => setQr({
                              value: subJsonUrl,
                              label: <Badge variant="primary">{t('pages.settings.subSettings')} JSON</Badge>
                          })}
                        />
                      )}
                      {subClashUrl && (
                        <LinkRow
                          tags={(
                            <Tooltip content="Clash / Mihomo">
                              <Badge variant="warning" className="shrink-0 font-semibold tracking-wide">CLASH</Badge>
                            </Tooltip>
                          )}
                          href={subClashUrl}
                          title={subClashUrl}
                          rowTitle={sId}
                          copyLabel={t('copy')}
                          onCopy={() => copy(subClashUrl)}
                          onQr={() => setQr({
                              value: subClashUrl,
                              label: <Badge variant="warning">Clash / Mihomo</Badge>
                          })}
                        />
                      )}
                    </div>
                  </>
                )}

                {links.length > 0 && (
                  <>
                    <SectionTitle>{t('pages.inbounds.copyLink')}</SectionTitle>
                    <div className="flex flex-col gap-2">
                      {links.map((link, idx) =>
                      {
                          const parts = parseLinkParts(link, linkEmails[idx] || '');
                          const fallback = `Link ${ idx + 1 }`;
                          const rowTitle = parts?.remark || fallback;
                          const qrLabel = [parts?.remark, linkEmails[idx]].filter(Boolean).join('-') || rowTitle;
                          const canQr = !isPostQuantumLink(link);
                          return (
                          <LinkRow
                            key={link}
                            tags={parts
                                ? <LinkTags parts={parts} />
                                : <Badge variant="neutral" className="shrink-0 font-semibold tracking-wide">LINK</Badge>}
                            title={rowTitle}
                            rowTitle={rowTitle}
                            copyLabel={t('copy')}
                            onCopy={() => copy(link)}
                            onQr={canQr ? () => setQr({
                                value: link,
                                label: <Badge variant="neutral">{qrLabel}</Badge>
                            }) : undefined}
                          />
                          );
                      })}
                    </div>
                  </>
                )}

                <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <DropdownMenu
                    align="start"
                    className={appDropdownClass}
                    label="Android"
                    items={androidMenuItems}
                    trigger={(
                      <span className="flex w-full items-center justify-center gap-2">
                        <Smartphone className="h-4 w-4" aria-hidden /> Android <ChevronDown className="h-4 w-4" aria-hidden />
                      </span>
                    )}
                  />
                  <DropdownMenu
                    align="start"
                    className={appDropdownClass}
                    label="iOS"
                    items={iosMenuItems}
                    trigger={(
                      <span className="flex w-full items-center justify-center gap-2">
                        <Apple className="h-4 w-4" aria-hidden /> iOS <ChevronDown className="h-4 w-4" aria-hidden />
                      </span>
                    )}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

      <Modal open={!!qr} onClose={() => setQr(null)} size="sm" title="QR">
        {qr && (
          <div className="flex flex-col items-center gap-3">
            <div className="w-full text-center">{qr.label}</div>
            <div className="rounded-lg bg-white p-3">
              <QRCode value={qr.value} size={QR_SIZE} />
            </div>
          </div>
        )}
      </Modal>
    </div>
    );
}
