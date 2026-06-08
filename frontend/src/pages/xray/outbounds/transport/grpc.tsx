import { useTranslation } from 'react-i18next';

import { RHFText, RHFSwitch } from '@/components/form/rhf';

export default function GrpcForm()
{
    const { t } = useTranslation();
    return (
    <>
      <RHFText name="streamSettings.grpcSettings.serviceName" label={t('pages.inbounds.form.serviceName')} />
      <RHFText name="streamSettings.grpcSettings.authority" label={t('pages.inbounds.form.authority')} />
      <RHFSwitch name="streamSettings.grpcSettings.multiMode" label={t('pages.inbounds.form.multiMode')} />
    </>
    );
}
