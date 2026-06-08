import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';

import { UTLS_FINGERPRINT } from '@/schemas/primitives';
import { validateRealityTarget } from '@/lib/xray/stream-wire-normalize';
import { Button, Input, Label } from '@/components/ui';
import { RHFText, RHFNumber, RHFTextarea, RHFSelect, RHFSwitch, RHFTags, Field, useFormContext } from '@/components/form/rhf';

const R = 'streamSettings.realitySettings';

interface RealityFormProps {
  saving: boolean;
  randomizeRealityTarget: () => void;
  randomizeShortIds: () => void;
  genRealityKeypair: () => void;
  clearRealityKeypair: () => void;
  genMldsa65: () => void;
  clearMldsa65: () => void;
}

export default function RealityForm({
    saving,
    randomizeRealityTarget,
    randomizeShortIds,
    genRealityKeypair,
    clearRealityKeypair,
    genMldsa65,
    clearMldsa65
}: RealityFormProps)
{
    const { t } = useTranslation();
    const { register } = useFormContext();
    return (
    <>
      <RHFSwitch name={`${ R }.show`} label={t('pages.inbounds.form.show')} />
      <RHFNumber name={`${ R }.xver`} label={t('pages.inbounds.form.xver')} min={0} />
      <RHFSelect
        name={`${ R }.settings.fingerprint`}
        label="uTLS"
        options={Object.values(UTLS_FINGERPRINT).map((fp) => ({ value: fp, label: fp }))}
      />
      <Field name={`${ R }.target`} label={t('pages.inbounds.form.target')} hint={t('pages.inbounds.form.realityTargetHint')}>
        <div className="flex gap-2">
          <Input
            className="flex-1"
            placeholder="example.com:443"
            {...register(`${ R }.target`, {
                validate: (v) =>
                {
                    const errKey = validateRealityTarget(typeof v === 'string' ? v : '');
                    return errKey ? t(errKey) : true;
                }
            })}
          />
          <Button variant="secondary" size="icon" aria-label={t('regenerate')} onClick={randomizeRealityTarget}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </Field>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label>SNI</Label>
          <Button variant="secondary" size="icon" aria-label={t('regenerate')} onClick={randomizeRealityTarget}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <RHFTags name={`${ R }.serverNames`} />
      </div>
      <RHFNumber name={`${ R }.maxTimediff`} label={t('pages.inbounds.form.maxTimeDiff')} min={0} />
      <RHFText name={`${ R }.minClientVer`} label={t('pages.inbounds.form.minClientVer')} placeholder="25.9.11" />
      <RHFText name={`${ R }.maxClientVer`} label={t('pages.inbounds.form.maxClientVer')} placeholder="25.9.11" />
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label>{t('pages.inbounds.form.shortIds')}</Label>
          <Button variant="secondary" size="icon" aria-label={t('regenerate')} onClick={randomizeShortIds}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <RHFTags name={`${ R }.shortIds`} />
      </div>
      <RHFText name={`${ R }.settings.spiderX`} label={t('pages.inbounds.form.spiderX')} />
      <RHFTextarea name={`${ R }.settings.publicKey`} label={t('pages.inbounds.publicKey')} rows={2} />
      <RHFTextarea name={`${ R }.privateKey`} label={t('pages.inbounds.privatekey')} rows={2} />
      <div className="flex gap-2">
        <Button loading={saving} onClick={genRealityKeypair}>
          {t('pages.inbounds.form.getNewCert')}
        </Button>
        <Button variant="danger" onClick={clearRealityKeypair}>
          {t('clear')}
        </Button>
      </div>
      <RHFTextarea name={`${ R }.mldsa65Seed`} label={t('pages.inbounds.form.mldsa65Seed')} rows={3} />
      <RHFTextarea name={`${ R }.settings.mldsa65Verify`} label={t('pages.inbounds.form.mldsa65Verify')} rows={3} />
      <div className="flex gap-2">
        <Button loading={saving} onClick={genMldsa65}>
          {t('pages.inbounds.form.getNewSeed')}
        </Button>
        <Button variant="danger" onClick={clearMldsa65}>
          {t('clear')}
        </Button>
      </div>
    </>
    );
}
