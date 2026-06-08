import { useTranslation } from 'react-i18next';

import { RHFSwitch } from '@/components/form/rhf';
import AccountsList from './accounts-list';

export default function HttpFields()
{
    const { t } = useTranslation();
    return (
    <>
      <AccountsList />
      <RHFSwitch name="settings.allowTransparent" label={t('pages.inbounds.form.allowTransparent')} />
    </>
    );
}
