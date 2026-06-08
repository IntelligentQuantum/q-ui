import { useTranslation } from 'react-i18next';

import { HeaderMapEditor } from '@/components/form';
import { RHFText, RHFNumber, RHFSelect, RHFSwitch, RHFField } from '@/components/form/rhf';

export default function TunnelFields()
{
    const { t } = useTranslation();
    return (
    <>
      <RHFText name="settings.rewriteAddress" label={t('pages.inbounds.form.rewriteAddress')} />
      <RHFNumber name="settings.rewritePort" label={t('pages.inbounds.form.rewritePort')} min={0} max={65535} />
      <RHFSelect
        name="settings.allowedNetwork"
        label={t('pages.inbounds.form.allowedNetwork')}
        options={[
            { value: 'tcp,udp', label: 'TCP, UDP' },
            { value: 'tcp', label: 'TCP' },
            { value: 'udp', label: 'UDP' }
        ]}
      />
      <RHFField
        name="settings.portMap"
        label={t('pages.inbounds.portMap')}
        render={({ value, onChange }) => (
          <HeaderMapEditor mode="v1" value={value as Record<string, string>} onChange={onChange} />
        )}
      />
      <RHFSwitch name="settings.followRedirect" label={t('pages.inbounds.form.followRedirect')} />
    </>
    );
}
