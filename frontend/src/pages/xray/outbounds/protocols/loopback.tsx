import { useTranslation } from 'react-i18next';
import { RHFText } from '@/components/form/rhf';

export default function LoopbackFields()
{
    const { t } = useTranslation();
    return (
    <RHFText
      name="settings.inboundTag"
      label={t('pages.xray.outboundForm.inboundTag')}
      placeholder={t('pages.xray.outboundForm.inboundTagPlaceholder')}
    />
    );
}
