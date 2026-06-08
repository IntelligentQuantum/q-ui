import { useTranslation } from 'react-i18next';

import { HeaderMapEditor } from '@/components/form';
import { RHFText, RHFSwitch, RHFField } from '@/components/form/rhf';

export default function HttpUpgradeForm()
{
    const { t } = useTranslation();
    return (
    <>
      <RHFSwitch
        name="streamSettings.httpupgradeSettings.acceptProxyProtocol"
        label={t('pages.inbounds.form.proxyProtocol')}
      />
      <RHFText name="streamSettings.httpupgradeSettings.host" label={t('host')} />
      <RHFText name="streamSettings.httpupgradeSettings.path" label={t('path')} />
      <RHFField
        name="streamSettings.httpupgradeSettings.headers"
        label={t('pages.inbounds.form.headers')}
        render={({ value, onChange }) => (
          <HeaderMapEditor mode="v1" value={value as Record<string, string>} onChange={onChange} />
        )}
      />
    </>
    );
}
