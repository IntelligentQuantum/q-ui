import { useTranslation } from 'react-i18next';

import { HeaderMapEditor } from '@/components/form';
import { RHFText, RHFNumber, RHFSwitch, RHFField } from '@/components/form/rhf';

export default function WsForm()
{
    const { t } = useTranslation();
    return (
    <>
      <RHFSwitch name="streamSettings.wsSettings.acceptProxyProtocol" label={t('pages.inbounds.form.proxyProtocol')} />
      <RHFText name="streamSettings.wsSettings.host" label={t('host')} />
      <RHFText name="streamSettings.wsSettings.path" label={t('path')} />
      <RHFNumber name="streamSettings.wsSettings.heartbeatPeriod" label={t('pages.inbounds.form.heartbeatPeriod')} min={0} />
      <RHFField
        name="streamSettings.wsSettings.headers"
        label={t('pages.inbounds.form.headers')}
        render={({ value, onChange }) => (
          <HeaderMapEditor mode="v1" value={value as Record<string, string>} onChange={onChange} />
        )}
      />
    </>
    );
}
