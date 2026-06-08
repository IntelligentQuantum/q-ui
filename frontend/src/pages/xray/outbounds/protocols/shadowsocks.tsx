import { useTranslation } from 'react-i18next';

import { ShadowsocksOutboundFormSettingsSchema } from '@/schemas/forms/outbound-form';
import { SSMethodSchema } from '@/schemas/protocols/shared/shadowsocks';
import { RHFText, RHFNumber, RHFSelect, RHFSwitch, zodRule } from '@/components/form/rhf';

import { SS_METHOD_OPTIONS } from '../outbound-form-constants';

export default function ShadowsocksFields()
{
    const { t } = useTranslation();
    return (
    <>
      <RHFText
        name="settings.password"
        label={t('password')}
        rules={zodRule(ShadowsocksOutboundFormSettingsSchema.shape.password, t)}
      />
      <RHFSelect name="settings.method" label={t('encryption')} options={SS_METHOD_OPTIONS} rules={zodRule(SSMethodSchema, t)} />
      <RHFSwitch name="settings.uot" label={t('pages.xray.outboundForm.udpOverTcp')} />
      <RHFNumber name="settings.UoTVersion" label={t('pages.xray.outboundForm.uotVersion')} min={1} max={2} />
    </>
    );
}
