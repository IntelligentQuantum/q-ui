import { useTranslation } from 'react-i18next';

import { TrojanOutboundFormSettingsSchema } from '@/schemas/forms/outbound-form';
import { RHFText, zodRule } from '@/components/form/rhf';

export default function TrojanFields()
{
    const { t } = useTranslation();
    return (
    <RHFText
      name="settings.password"
      label={t('password')}
      rules={zodRule(TrojanOutboundFormSettingsSchema.shape.password, t)}
    />
    );
}
