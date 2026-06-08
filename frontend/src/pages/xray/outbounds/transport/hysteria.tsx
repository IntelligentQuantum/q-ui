import { useTranslation } from 'react-i18next';

import { HeaderMapEditor } from '@/components/form';
import { Label, Switch } from '@/components/ui';
import {
    RHFText,
    RHFNumber,
    RHFTextarea,
    RHFSelect,
    RHFSwitch,
    RHFField,
    useFormContext,
    useWatch
} from '@/components/form/rhf';

const MASQ = 'streamSettings.hysteriaSettings.masquerade';

export default function HysteriaForm()
{
    const { t } = useTranslation();
    const { setValue } = useFormContext();
    const masq = useWatch({ name: MASQ }) as { type?: string } | undefined;
    return (
    <>
      <RHFNumber
        name="streamSettings.hysteriaSettings.version"
        label={t('pages.inbounds.form.version')}
        min={2}
        max={2}
        disabled
      />
      <RHFText name="streamSettings.hysteriaSettings.auth" label={t('pages.xray.outboundForm.authPassword')} />
      <RHFNumber
        name="streamSettings.hysteriaSettings.udpIdleTimeout"
        label={t('pages.inbounds.form.udpIdleTimeout')}
        min={1}
      />

      <div className="flex items-center justify-between gap-3">
        <Label>{t('pages.inbounds.form.masquerade')}</Label>
        <Switch
          checked={!!masq}
          aria-label={t('pages.inbounds.form.masquerade')}
          onCheckedChange={(c) =>
              setValue(
                  MASQ,
                  c
                      ? { type: '', dir: '', url: '', rewriteHost: false, insecure: false, content: '', headers: {}, statusCode: 0 }
                      : undefined
              )
          }
        />
      </div>
      {masq && (
        <>
          <RHFSelect
            name={`${ MASQ }.type`}
            label={t('pages.inbounds.form.type')}
            options={[
                { value: '', label: 'default (404 page)' },
                { value: 'proxy', label: 'proxy (reverse proxy)' },
                { value: 'file', label: 'file (serve directory)' },
                { value: 'string', label: 'string (fixed body)' }
            ]}
          />
          {masq.type === 'proxy' && (
            <>
              <RHFText name={`${ MASQ }.url`} label={t('pages.inbounds.form.upstreamUrl')} placeholder="https://www.example.com" />
              <RHFSwitch name={`${ MASQ }.rewriteHost`} label={t('pages.inbounds.form.rewriteHost')} />
              <RHFSwitch name={`${ MASQ }.insecure`} label={t('pages.inbounds.form.skipTlsVerify')} />
            </>
          )}
          {masq.type === 'file' && (
            <RHFText name={`${ MASQ }.dir`} label={t('pages.inbounds.form.directory')} placeholder="/var/www/html" />
          )}
          {masq.type === 'string' && (
            <>
              <RHFNumber name={`${ MASQ }.statusCode`} label={t('pages.inbounds.form.statusCode')} min={0} max={599} />
              <RHFTextarea name={`${ MASQ }.content`} label={t('pages.inbounds.form.body')} rows={3} />
              <RHFField
                name={`${ MASQ }.headers`}
                label={t('pages.inbounds.form.headers')}
                render={({ value, onChange }) => (
                  <HeaderMapEditor mode="v1" value={value as Record<string, string>} onChange={onChange} />
                )}
              />
            </>
          )}
        </>
      )}
    </>
    );
}
