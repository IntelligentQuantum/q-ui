import { useTranslation } from 'react-i18next';

import { Button, Input } from '@/components/ui';
import { RHFText, Field, useFormContext } from '@/components/form/rhf';

interface VlessFieldsProps {
  saving: boolean;
  selectedVlessAuth: string;
  network: string;
  security: string;
  getNewVlessEnc: (kind: 'x25519' | 'mlkem768') => void;
  clearVlessEnc: () => void;
}

export default function VlessFields({
    saving,
    selectedVlessAuth,
    network,
    security,
    getNewVlessEnc,
    clearVlessEnc
}: VlessFieldsProps)
{
    const { t } = useTranslation();
    const { register } = useFormContext();
    const showTestseed = network === 'tcp' && (security === 'tls' || security === 'reality');
    return (
    <>
      <RHFText name="settings.decryption" label={t('pages.inbounds.decryption')} />
      <RHFText name="settings.encryption" label={t('pages.inbounds.encryption')} />
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Button loading={saving} onClick={() => getNewVlessEnc('x25519')}>
            {t('pages.inbounds.vlessAuthX25519')}
          </Button>
          <Button loading={saving} onClick={() => getNewVlessEnc('mlkem768')}>
            {t('pages.inbounds.vlessAuthMlkem768')}
          </Button>
          <Button variant="danger" onClick={clearVlessEnc}>
            {t('clear')}
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">
          {t('pages.inbounds.vlessAuthSelected', { auth: selectedVlessAuth })}
        </span>
      </div>
      {showTestseed && (
        <Field
          label={t('pages.inbounds.form.visionTestseed')}
          hint="Applies only to clients using the xtls-rprx-vision flow; ignored otherwise."
        >
          <div className="flex gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Input key={i} type="number" min={1} {...register(`settings.testseed.${ i }`, { valueAsNumber: true })} />
            ))}
          </div>
        </Field>
      )}
    </>
    );
}
