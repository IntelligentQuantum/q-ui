import { useTranslation } from 'react-i18next';
import { Plus, Minus } from 'lucide-react';

import { DOMAIN_STRATEGY_OPTION, TCP_CONGESTION_OPTION } from '@/schemas/primitives';
import { HappyEyeballsSchema, SockoptStreamSettingsSchema } from '@/schemas/protocols/stream/sockopt';
import { Button, Label, Switch } from '@/components/ui';
import {
    RHFText,
    RHFNumber,
    RHFSelect,
    RHFSwitch,
    RHFTags,
    useFieldArray,
    useFormContext,
    useWatch
} from '@/components/form/rhf';

import { ADDRESS_PORT_STRATEGY_OPTIONS } from '../outbound-form-constants';

const SO = 'streamSettings.sockopt';

export default function SockoptForm({
    outboundTags = []
}: {
  outboundTags?: string[];
})
{
    const { t } = useTranslation();
    const { control, setValue } = useFormContext();
    const sockopt = useWatch({ name: SO }) as Record<string, unknown> | undefined;
    const hasSockopt = sockopt != null;
    const hasHe = useWatch({ name: `${ SO }.happyEyeballs` }) != null;
    const dialerProxy = (useWatch({ name: `${ SO }.dialerProxy` }) ?? '') as string;
    const custom = useFieldArray({ control, name: `${ SO }.customSockopt` });

    const dialerProxyOptions = [
        { value: '', label: t('pages.xray.outboundForm.dialerProxyPlaceholder') },
        ...Array.from(new Set([...outboundTags, dialerProxy].filter(Boolean))).map((tg) => ({ value: tg, label: tg }))
    ];

    return (
    <>
      <div className="flex items-center justify-between gap-3">
        <Label>{t('pages.xray.outboundForm.sockopts')}</Label>
        <Switch
          checked={hasSockopt}
          aria-label={t('pages.xray.outboundForm.sockopts')}
          onCheckedChange={(c) => setValue(SO, c ? SockoptStreamSettingsSchema.parse({}) : undefined)}
        />
      </div>
      {hasSockopt && (
        <>
          <RHFSelect
            name={`${ SO }.dialerProxy`}
            label={t('pages.inbounds.form.dialerProxy')}
            hint={t('pages.xray.outboundForm.dialerProxyHint')}
            placeholder={t('pages.xray.outboundForm.dialerProxyPlaceholder')}
            options={dialerProxyOptions}
          />
          <RHFSelect
            name={`${ SO }.domainStrategy`}
            label={t('pages.xray.wireguard.domainStrategy')}
            options={Object.values(DOMAIN_STRATEGY_OPTION).map((v) => ({ value: v, label: v }))}
          />
          <RHFSelect
            name={`${ SO }.addressPortStrategy`}
            label={t('pages.inbounds.form.addressPortStrategy')}
            options={ADDRESS_PORT_STRATEGY_OPTIONS}
          />
          <RHFNumber name={`${ SO }.tcpKeepAliveInterval`} label={t('pages.xray.outboundForm.keepAliveInterval')} min={0} />
          <RHFSwitch name={`${ SO }.tcpFastOpen`} label={t('pages.inbounds.form.tcpFastOpen')} />
          <RHFSwitch name={`${ SO }.tcpMptcp`} label={t('pages.inbounds.form.multipathTcp')} />
          <RHFSwitch name={`${ SO }.penetrate`} label={t('pages.inbounds.form.penetrate')} />
          <RHFNumber name={`${ SO }.mark`} label={t('pages.xray.outboundForm.markFwmark')} min={0} />
          <RHFText name={`${ SO }.interface`} label={t('pages.xray.outboundForm.interface')} />
          <RHFSelect
            name={`${ SO }.tproxy`}
            label="TProxy"
            options={[
                { value: 'off', label: 'off' },
                { value: 'redirect', label: 'redirect' },
                { value: 'tproxy', label: 'tproxy' }
            ]}
          />
          <RHFSelect
            name={`${ SO }.tcpcongestion`}
            label={t('pages.inbounds.form.tcpCongestion')}
            options={Object.values(TCP_CONGESTION_OPTION).map((v) => ({ value: v, label: v }))}
          />
          <RHFSwitch name={`${ SO }.V6Only`} label={t('pages.xray.outboundForm.ipv6Only')} />
          <RHFSwitch name={`${ SO }.acceptProxyProtocol`} label={t('pages.xray.outboundForm.acceptProxyProtocol')} />
          <RHFNumber name={`${ SO }.tcpUserTimeout`} label={t('pages.xray.outboundForm.tcpUserTimeoutMs')} min={0} />
          <RHFNumber name={`${ SO }.tcpKeepAliveIdle`} label={t('pages.xray.outboundForm.tcpKeepAliveIdleS')} min={0} />
          <RHFNumber name={`${ SO }.tcpMaxSeg`} label={t('pages.inbounds.form.tcpMaxSeg')} min={0} />
          <RHFNumber
            name={`${ SO }.tcpWindowClamp`}
            label={t('pages.inbounds.form.tcpWindowClamp')}
            hint={t('pages.inbounds.form.tcpWindowClampHint')}
            min={0}
          />
          <RHFTags
            name={`${ SO }.trustedXForwardedFor`}
            label={t('pages.inbounds.form.trustedXForwardedFor')}
            placeholder="trusted-proxy.example,10.0.0.0/8"
          />

          <div className="flex items-center justify-between gap-3">
            <Label>Happy Eyeballs</Label>
            <Switch
              checked={hasHe}
              aria-label="Happy Eyeballs"
              onCheckedChange={(v) => setValue(`${ SO }.happyEyeballs`, v ? HappyEyeballsSchema.parse({}) : undefined)}
            />
          </div>
          {hasHe && (
            <>
              <RHFNumber
                name={`${ SO }.happyEyeballs.tryDelayMs`}
                label={t('pages.inbounds.form.tryDelayMs')}
                min={0}
                placeholder="0 (disabled) — 250 recommended"
              />
              <RHFSwitch name={`${ SO }.happyEyeballs.prioritizeIPv6`} label={t('pages.inbounds.form.prioritizeIPv6')} />
              <RHFNumber name={`${ SO }.happyEyeballs.interleave`} label={t('pages.inbounds.form.interleave')} min={1} />
              <RHFNumber name={`${ SO }.happyEyeballs.maxConcurrentTry`} label={t('pages.inbounds.form.maxConcurrentTry')} min={0} />
            </>
          )}

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label>{t('pages.inbounds.form.customSockopt')}</Label>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => custom.append({ system: '', type: 'int', level: '6', opt: '', value: '' })}
              >
                <Plus className="h-4 w-4" />
                {t('pages.inbounds.form.addCustomOption')}
              </Button>
            </div>
            {custom.fields.map((field, index) => (
              <div key={field.id} className="flex flex-wrap items-start gap-2 rounded-lg border border-border p-3">
                <RHFSelect
                  className="w-28"
                  name={`${ SO }.customSockopt.${ index }.system`}
                  placeholder="all"
                  options={[
                      { value: '', label: 'all' },
                      { value: 'linux', label: 'linux' },
                      { value: 'windows', label: 'windows' },
                      { value: 'darwin', label: 'darwin' }
                  ]}
                />
                <RHFSelect
                  className="w-24"
                  name={`${ SO }.customSockopt.${ index }.type`}
                  options={[
                      { value: 'int', label: 'int' },
                      { value: 'str', label: 'str' }
                  ]}
                />
                <RHFText className="w-28" name={`${ SO }.customSockopt.${ index }.level`} placeholder="level (6=TCP)" />
                <RHFText className="w-32" name={`${ SO }.customSockopt.${ index }.opt`} placeholder="opt (decimal)" />
                <RHFText className="min-w-32 flex-1" name={`${ SO }.customSockopt.${ index }.value`} placeholder="value" />
                <Button variant="ghost" size="icon" aria-label={t('delete')} onClick={() => custom.remove(index)}>
                  <Minus className="h-4 w-4 text-danger" />
                </Button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
    );
}
