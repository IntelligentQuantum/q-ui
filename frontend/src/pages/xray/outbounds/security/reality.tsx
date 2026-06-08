import { useTranslation } from 'react-i18next';

import { RHFText, RHFTextarea, RHFSelect } from '@/components/form/rhf';

import { UTLS_OPTIONS } from '../outbound-form-constants';

export default function RealityForm()
{
    const { t } = useTranslation();
    return (
    <>
      <RHFText name="streamSettings.realitySettings.serverName" label="SNI" />
      <RHFSelect name="streamSettings.realitySettings.fingerprint" label="uTLS" options={UTLS_OPTIONS} />
      <RHFText name="streamSettings.realitySettings.shortId" label={t('pages.xray.outboundForm.shortId')} />
      <RHFText name="streamSettings.realitySettings.spiderX" label={t('pages.inbounds.form.spiderX')} />
      <RHFTextarea name="streamSettings.realitySettings.publicKey" label={t('pages.inbounds.publicKey')} rows={2} />
      <RHFTextarea name="streamSettings.realitySettings.mldsa65Verify" label={t('pages.inbounds.form.mldsa65Verify')} rows={2} />
    </>
    );
}
