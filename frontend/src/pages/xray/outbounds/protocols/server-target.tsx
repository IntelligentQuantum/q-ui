import { useTranslation } from 'react-i18next';
import { RHFText, RHFNumber } from '@/components/form/rhf';

export default function ServerTarget()
{
    const { t } = useTranslation();
    return (
    <>
      <RHFText
        name="settings.address"
        label={t('pages.inbounds.address')}
        rules={{ required: t('pages.xray.outboundForm.addressRequired') }}
      />
      <RHFNumber
        name="settings.port"
        label={t('pages.inbounds.port')}
        min={1}
        max={65535}
        rules={{ required: t('pages.xray.outboundForm.portRequired') }}
      />
    </>
    );
}
