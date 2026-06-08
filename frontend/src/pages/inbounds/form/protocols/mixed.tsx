import { useTranslation } from 'react-i18next';

import { RHFText, RHFSelect, RHFSwitch } from '@/components/form/rhf';
import AccountsList from './accounts-list';

export default function MixedFields({ mixedUdpOn }: { mixedUdpOn: boolean })
{
    const { t } = useTranslation();
    return (
    <>
      <AccountsList />
      <RHFSelect
        name="settings.auth"
        label={t('pages.inbounds.info.auth')}
        options={[
            { value: 'noauth', label: 'noauth' },
            { value: 'password', label: 'password' }
        ]}
      />
      <RHFSwitch name="settings.udp" label="UDP" />
      {mixedUdpOn && <RHFText name="settings.ip" label="UDP IP" />}
    </>
    );
}
