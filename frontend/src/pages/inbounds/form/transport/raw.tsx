import { useTranslation } from 'react-i18next';

import { HeaderMapEditor } from '@/components/form';
import { Input, Label, Switch } from '@/components/ui';
import { RHFText, RHFSwitch, RHFField, useFormContext, useWatch } from '@/components/form/rhf';

const HEADER = 'streamSettings.tcpSettings.header';

export default function RawForm()
{
    const { t } = useTranslation();
    const { setValue } = useFormContext();
    const type = (useWatch({ name: `${ HEADER }.type` }) ?? 'none') as string;
    const isHttp = type === 'http';
    return (
    <>
      <RHFSwitch name="streamSettings.tcpSettings.acceptProxyProtocol" label={t('pages.inbounds.form.proxyProtocol')} />
      <div className="flex items-center justify-between gap-3">
        <Label>{`HTTP ${ t('camouflage') }`}</Label>
        <Switch
          checked={isHttp}
          aria-label={`HTTP ${ t('camouflage') }`}
          onCheckedChange={(c) =>
              setValue(
                  HEADER,
                  c
                      ? {
                          type: 'http',
                          request: { version: '1.1', method: 'GET', path: ['/'], headers: {} },
                          response: { version: '1.1', status: '200', reason: 'OK', headers: {} }
                      }
                      : { type: 'none' }
              )
          }
        />
      </div>
      {isHttp && (
        <>
          <RHFText name={`${ HEADER }.request.version`} label={t('pages.inbounds.form.requestVersion')} placeholder="1.1" />
          <RHFText name={`${ HEADER }.request.method`} label={t('pages.inbounds.form.requestMethod')} placeholder="GET" />
          <RHFField
            name={`${ HEADER }.request.path`}
            label={t('pages.inbounds.form.requestPath')}
            render={({ value, onChange }) => (
              <Input
                value={Array.isArray(value) ? value.join(',') : ((value as string) ?? '')}
                placeholder="/"
                onChange={(e) =>
                {
                    const parts = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                    onChange(parts.length > 0 ? parts : ['/']);
                }}
              />
            )}
          />
          <RHFField
            name={`${ HEADER }.request.headers`}
            label={t('pages.inbounds.form.requestHeaders')}
            render={({ value, onChange }) => (
              <HeaderMapEditor mode="v2" value={value as Record<string, string[]>} onChange={onChange} />
            )}
          />
          <RHFText name={`${ HEADER }.response.version`} label={t('pages.inbounds.form.responseVersion')} placeholder="1.1" />
          <RHFText name={`${ HEADER }.response.status`} label={t('pages.inbounds.form.responseStatus')} placeholder="200" />
          <RHFText name={`${ HEADER }.response.reason`} label={t('pages.inbounds.form.responseReason')} placeholder="OK" />
          <RHFField
            name={`${ HEADER }.response.headers`}
            label={t('pages.inbounds.form.responseHeaders')}
            render={({ value, onChange }) => (
              <HeaderMapEditor mode="v2" value={value as Record<string, string[]>} onChange={onChange} />
            )}
          />
        </>
      )}
    </>
    );
}
