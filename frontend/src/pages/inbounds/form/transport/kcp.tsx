import { useTranslation } from 'react-i18next';

import { RHFNumber } from '@/components/form/rhf';

export default function KcpForm()
{
    const { t } = useTranslation();
    return (
    <>
      <RHFNumber name="streamSettings.kcpSettings.mtu" label="MTU" min={576} max={1460} />
      <RHFNumber name="streamSettings.kcpSettings.tti" label={t('pages.inbounds.form.ttiMs')} min={10} max={100} />
      <RHFNumber name="streamSettings.kcpSettings.uplinkCapacity" label={t('pages.inbounds.form.uplinkMbps')} min={0} />
      <RHFNumber name="streamSettings.kcpSettings.downlinkCapacity" label={t('pages.inbounds.form.downlinkMbps')} min={0} />
      <RHFNumber name="streamSettings.kcpSettings.cwndMultiplier" label={t('pages.inbounds.form.cwndMultiplier')} min={1} />
      <RHFNumber name="streamSettings.kcpSettings.maxSendingWindow" label={t('pages.inbounds.form.maxSendingWindow')} min={0} />
    </>
    );
}
