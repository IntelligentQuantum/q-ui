import { useTranslation } from 'react-i18next';
import { RHFSelect } from '@/components/form/rhf';

export default function BlackholeFields()
{
    const { t } = useTranslation();
    return (
    <RHFSelect
      name="settings.type"
      label={t('pages.xray.outboundForm.responseType')}
      options={[
          { value: '', label: '(empty)' },
          { value: 'none', label: 'none' },
          { value: 'http', label: 'http' }
      ]}
    />
    );
}
