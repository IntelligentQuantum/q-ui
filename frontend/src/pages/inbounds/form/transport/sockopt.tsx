import { useTranslation } from 'react-i18next';
import { Plus, Minus } from 'lucide-react';

import { Address_Port_Strategy, DOMAIN_STRATEGY_OPTION, TCP_CONGESTION_OPTION } from '@/schemas/primitives';
import { HappyEyeballsSchema } from '@/schemas/protocols/stream/sockopt';
import { Button, Label, Switch } from '@/components/ui';
import { RHFText, RHFNumber, RHFSelect, RHFSwitch, RHFTags, useFormContext, useWatch } from '@/components/form/rhf';

const SO = 'streamSettings.sockopt';

export default function SockoptForm({ toggleSockopt }: { toggleSockopt: (on: boolean) => void })
{
    const { t } = useTranslation();
    const { getValues, setValue } = useFormContext();
    const sock = useWatch({ name: SO }) as Record<string, unknown> | undefined;
    const on = !!sock && typeof sock === 'object' && Object.keys(sock).length > 0;
    const hasHe = useWatch({ name: `${ SO }.happyEyeballs` }) != null;
    const custom = (useWatch({ name: `${ SO }.customSockopt` }) ?? []) as unknown[];

    const addCustom = () =>
    {
        const cur = (getValues(`${ SO }.customSockopt`) ?? []) as unknown[];
        setValue(`${ SO }.customSockopt`, [...cur, { system: '', type: 'int', level: '6', opt: '', value: '' }]);
    };
    const removeCustom = (idx: number) =>
    {
        const cur = (getValues(`${ SO }.customSockopt`) ?? []) as unknown[];
        setValue(`${ SO }.customSockopt`, cur.filter((_, i) => i !== idx));
    };

    return (
    <>
      <div className="flex items-center justify-between gap-3">
        <Label>Sockopt</Label>
        <Switch checked={on} aria-label="Sockopt" onCheckedChange={toggleSockopt} />
      </div>
      {on && (
        <>
          <RHFNumber name={`${ SO }.mark`} label={t('pages.inbounds.form.routeMark')} min={0} />
          <RHFNumber name={`${ SO }.tcpKeepAliveInterval`} label={t('pages.inbounds.form.tcpKeepAliveInterval')} min={0} />
          <RHFNumber name={`${ SO }.tcpKeepAliveIdle`} label={t('pages.inbounds.form.tcpKeepAliveIdle')} min={0} />
          <RHFNumber name={`${ SO }.tcpMaxSeg`} label={t('pages.inbounds.form.tcpMaxSeg')} min={0} />
          <RHFNumber name={`${ SO }.tcpUserTimeout`} label={t('pages.inbounds.form.tcpUserTimeout')} min={0} />
          <RHFNumber
            name={`${ SO }.tcpWindowClamp`}
            label={t('pages.inbounds.form.tcpWindowClamp')}
            hint={t('pages.inbounds.form.tcpWindowClampHint')}
            min={0}
          />
          <RHFSwitch name={`${ SO }.acceptProxyProtocol`} label={t('pages.inbounds.form.proxyProtocol')} />
          <RHFSwitch name={`${ SO }.tcpFastOpen`} label={t('pages.inbounds.form.tcpFastOpen')} />
          <RHFSwitch name={`${ SO }.tcpMptcp`} label={t('pages.inbounds.form.multipathTcp')} />
          <RHFSwitch name={`${ SO }.penetrate`} label={t('pages.inbounds.form.penetrate')} />
          <RHFSwitch name={`${ SO }.V6Only`} label={t('pages.inbounds.form.v6Only')} />
          <RHFSelect
            name={`${ SO }.domainStrategy`}
            label={t('pages.xray.wireguard.domainStrategy')}
            options={Object.values(DOMAIN_STRATEGY_OPTION).map((d) => ({ value: d, label: d }))}
          />
          <RHFSelect
            name={`${ SO }.tcpcongestion`}
            label={t('pages.inbounds.form.tcpCongestion')}
            options={Object.values(TCP_CONGESTION_OPTION).map((c) => ({ value: c, label: c }))}
          />
          <RHFSelect
            name={`${ SO }.tproxy`}
            label="TProxy"
            options={[
                { value: 'off', label: 'Off' },
                { value: 'redirect', label: 'Redirect' },
                { value: 'tproxy', label: 'TProxy' }
            ]}
          />
          <RHFText name={`${ SO }.dialerProxy`} label={t('pages.inbounds.form.dialerProxy')} />
          <RHFText name={`${ SO }.interface`} label={t('pages.inbounds.info.interfaceName')} />
          <RHFTags
            name={`${ SO }.trustedXForwardedFor`}
            label={t('pages.inbounds.form.trustedXForwardedFor')}
            placeholder="CF-Connecting-IP, X-Real-IP"
          />
          <RHFSelect
            name={`${ SO }.addressPortStrategy`}
            label={t('pages.inbounds.form.addressPortStrategy')}
            options={Object.values(Address_Port_Strategy).map((v) => ({ value: v, label: v }))}
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
                placeholder="0 disabled — 250 recommended"
              />
              <RHFSwitch name={`${ SO }.happyEyeballs.prioritizeIPv6`} label={t('pages.inbounds.form.prioritizeIPv6')} />
              <RHFNumber name={`${ SO }.happyEyeballs.interleave`} label={t('pages.inbounds.form.interleave')} min={1} />
              <RHFNumber name={`${ SO }.happyEyeballs.maxConcurrentTry`} label={t('pages.inbounds.form.maxConcurrentTry')} min={0} />
            </>
          )}

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label>{t('pages.inbounds.form.customSockopt')}</Label>
              <Button size="sm" variant="secondary" onClick={addCustom}>
                <Plus className="h-4 w-4" />
                {t('pages.inbounds.form.addCustomOption')}
              </Button>
            </div>
            {custom.map((_, idx) => (
              <div key={idx} className="flex flex-wrap items-start gap-2 rounded-lg border border-border p-3">
                <RHFSelect
                  className="w-28"
                  name={`${ SO }.customSockopt.${ idx }.system`}
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
                  name={`${ SO }.customSockopt.${ idx }.type`}
                  options={[
                      { value: 'int', label: 'int' },
                      { value: 'str', label: 'str' }
                  ]}
                />
                <RHFText className="w-28" name={`${ SO }.customSockopt.${ idx }.level`} placeholder="level (6=TCP)" />
                <RHFText className="w-32" name={`${ SO }.customSockopt.${ idx }.opt`} placeholder="opt" />
                <RHFText className="min-w-32 flex-1" name={`${ SO }.customSockopt.${ idx }.value`} placeholder="value" />
                <Button variant="ghost" size="icon" aria-label={t('delete')} onClick={() => removeCustom(idx)}>
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
