import { useTranslation } from 'react-i18next';

import {
    VlessOutboundFormSettingsSchema,
    VmessOutboundFormSettingsSchema
} from '@/schemas/forms/outbound-form';
import { RHFText, zodRule } from '@/components/form/rhf';

export default function VlessFields()
{
    const { t } = useTranslation();
    return (
    <>
      <RHFText name="settings.id" label="ID" placeholder="UUID" rules={zodRule(VmessOutboundFormSettingsSchema.shape.id, t)} />
      <RHFText
        name="settings.encryption"
        label={t('encryption')}
        rules={zodRule(VlessOutboundFormSettingsSchema.shape.encryption, t)}
      />
      <RHFText
        name="settings.reverseTag"
        label={t('pages.clients.reverseTag')}
        placeholder={t('pages.xray.outboundForm.optional')}
      />
    </>
    );
}
