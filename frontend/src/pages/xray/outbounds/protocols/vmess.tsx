import { useTranslation } from 'react-i18next';

import { VmessOutboundFormSettingsSchema } from '@/schemas/forms/outbound-form';
import { RHFText, RHFSelect, zodRule } from '@/components/form/rhf';

import { SECURITY_OPTIONS } from '../outbound-form-constants';

export default function VmessFields()
{
    const { t } = useTranslation();
    return (
    <>
      <RHFText name="settings.id" label="ID" placeholder="UUID" rules={zodRule(VmessOutboundFormSettingsSchema.shape.id, t)} />
      <RHFSelect
        name="settings.security"
        label={t('security')}
        options={SECURITY_OPTIONS}
        rules={zodRule(VmessOutboundFormSettingsSchema.shape.security, t)}
      />
    </>
    );
}
