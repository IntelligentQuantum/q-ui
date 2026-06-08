import { useTranslation } from 'react-i18next';
import { RHFText } from '@/components/form/rhf';

export default function SocksFields()
{
    const { t } = useTranslation();
    return (
    <>
      <RHFText name="settings.user" label={t('username')} />
      <RHFText name="settings.pass" label={t('password')} />
    </>
    );
}
