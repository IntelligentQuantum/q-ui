import { useTranslation } from 'react-i18next';

import { HeaderMapEditor } from '@/components/form';
import { Label, Switch } from '@/components/ui';
import {
    RHFText,
    RHFNumber,
    RHFSelect,
    RHFSwitch,
    RHFField,
    Controller,
    useFormContext,
    useWatch
} from '@/components/form/rhf';

import { MODE_OPTIONS } from '../outbound-form-constants';

interface XhttpFormProps {
  onXmuxToggle: (checked: boolean) => void;
}

const X = 'streamSettings.xhttpSettings';

export default function XhttpForm({ onXmuxToggle }: XhttpFormProps)
{
    const { t } = useTranslation();
    const { control } = useFormContext();
    const mode = useWatch({ name: `${ X }.mode` }) as string | undefined;
    const obfs = !!useWatch({ name: `${ X }.xPaddingObfsMode` });
    const sessionPlacement = useWatch({ name: `${ X }.sessionPlacement` }) as string | undefined;
    const seqPlacement = useWatch({ name: `${ X }.seqPlacement` }) as string | undefined;
    const uplinkDataPlacement = useWatch({ name: `${ X }.uplinkDataPlacement` }) as string | undefined;
    const enableXmux = !!useWatch({ name: `${ X }.enableXmux` });

    return (
    <>
      <RHFText name={`${ X }.host`} label={t('host')} />
      <RHFText name={`${ X }.path`} label={t('path')} />
      <RHFSelect name={`${ X }.mode`} label={t('pages.inbounds.info.mode')} options={MODE_OPTIONS} />
      <RHFText name={`${ X }.xPaddingBytes`} label={t('pages.inbounds.form.paddingBytes')} />
      <RHFField
        name={`${ X }.headers`}
        label={t('pages.inbounds.form.headers')}
        render={({ value, onChange }) => (
          <HeaderMapEditor mode="v1" value={value as Record<string, string>} onChange={onChange} />
        )}
      />

      <RHFSwitch name={`${ X }.xPaddingObfsMode`} label={t('pages.inbounds.form.paddingObfsMode')} />
      {obfs && (
        <>
          <RHFText name={`${ X }.xPaddingKey`} label={t('pages.inbounds.form.paddingKey')} placeholder="x_padding" />
          <RHFText name={`${ X }.xPaddingHeader`} label={t('pages.inbounds.form.paddingHeader')} placeholder="X-Padding" />
          <RHFSelect
            name={`${ X }.xPaddingPlacement`}
            label={t('pages.inbounds.form.paddingPlacement')}
            options={[
                { value: '', label: 'Default (queryInHeader)' },
                { value: 'queryInHeader', label: 'queryInHeader' },
                { value: 'header', label: 'header' },
                { value: 'cookie', label: 'cookie' },
                { value: 'query', label: 'query' }
            ]}
          />
          <RHFSelect
            name={`${ X }.xPaddingMethod`}
            label={t('pages.inbounds.form.paddingMethod')}
            options={[
                { value: '', label: 'Default (repeat-x)' },
                { value: 'repeat-x', label: 'repeat-x' },
                { value: 'tokenish', label: 'tokenish' }
            ]}
          />
        </>
      )}

      <RHFSelect
        name={`${ X }.uplinkHTTPMethod`}
        label={t('pages.inbounds.form.uplinkHttpMethod')}
        placeholder="Default (POST)"
        options={[
            { value: '', label: 'Default (POST)' },
            { value: 'POST', label: 'POST' },
            { value: 'PUT', label: 'PUT' },
            { value: 'GET', label: 'GET (packet-up only)', disabled: mode !== 'packet-up' }
        ]}
      />

      <RHFSelect
        name={`${ X }.sessionPlacement`}
        label={t('pages.inbounds.form.sessionPlacement')}
        placeholder="Default (path)"
        options={[
            { value: '', label: 'Default (path)' },
            { value: 'path', label: 'path' },
            { value: 'header', label: 'header' },
            { value: 'cookie', label: 'cookie' },
            { value: 'query', label: 'query' }
        ]}
      />
      {sessionPlacement && sessionPlacement !== 'path' && (
        <RHFText name={`${ X }.sessionKey`} label={t('pages.inbounds.form.sessionKey')} placeholder="x_session" />
      )}
      <RHFSelect
        name={`${ X }.seqPlacement`}
        label={t('pages.inbounds.form.sequencePlacement')}
        placeholder="Default (path)"
        options={[
            { value: '', label: 'Default (path)' },
            { value: 'path', label: 'path' },
            { value: 'header', label: 'header' },
            { value: 'cookie', label: 'cookie' },
            { value: 'query', label: 'query' }
        ]}
      />
      {seqPlacement && seqPlacement !== 'path' && (
        <RHFText name={`${ X }.seqKey`} label={t('pages.inbounds.form.sequenceKey')} placeholder="x_seq" />
      )}

      {mode === 'packet-up' && (
        <>
          <RHFText name={`${ X }.scMinPostsIntervalMs`} label={t('pages.xray.outboundForm.minUploadInterval')} placeholder="30" />
          <RHFText name={`${ X }.scMaxEachPostBytes`} label={t('pages.xray.outboundForm.maxUploadSizeBytes')} placeholder="1000000" />
          <RHFSelect
            name={`${ X }.uplinkDataPlacement`}
            label={t('pages.inbounds.form.uplinkDataPlacement')}
            options={[
                { value: '', label: 'Default (body)' },
                { value: 'body', label: 'body' },
                { value: 'header', label: 'header' },
                { value: 'cookie', label: 'cookie' },
                { value: 'query', label: 'query' }
            ]}
          />
          {uplinkDataPlacement && uplinkDataPlacement !== 'body' && (
            <>
              <RHFText name={`${ X }.uplinkDataKey`} label={t('pages.inbounds.form.uplinkDataKey')} placeholder="x_data" />
              <RHFNumber name={`${ X }.uplinkChunkSize`} label={t('pages.xray.outboundForm.uplinkChunkSize')} min={0} placeholder="0 (unlimited)" />
            </>
          )}
        </>
      )}
      {(mode === 'stream-up' || mode === 'stream-one') && (
        <RHFSwitch name={`${ X }.noGRPCHeader`} label={t('pages.xray.outboundForm.noGrpcHeader')} />
      )}

      <div className="flex items-center justify-between gap-3">
        <Label>XMUX</Label>
        <Controller
          control={control}
          name={`${ X }.enableXmux`}
          render={({ field }) => (
            <Switch
              checked={!!field.value}
              aria-label="XMUX"
              onCheckedChange={(c) =>
              {
                  field.onChange(c);
                  onXmuxToggle(c);
              }}
            />
          )}
        />
      </div>
      {enableXmux && (
        <>
          <RHFText name={`${ X }.xmux.maxConcurrency`} label={t('pages.xray.outboundForm.maxConcurrency')} placeholder="16-32" />
          <RHFText name={`${ X }.xmux.maxConnections`} label={t('pages.xray.outboundForm.maxConnections')} placeholder="0" />
          <RHFText name={`${ X }.xmux.cMaxReuseTimes`} label={t('pages.xray.outboundForm.maxReuseTimes')} />
          <RHFText name={`${ X }.xmux.hMaxRequestTimes`} label={t('pages.xray.outboundForm.maxRequestTimes')} placeholder="600-900" />
          <RHFText name={`${ X }.xmux.hMaxReusableSecs`} label={t('pages.xray.outboundForm.maxReusableSecs')} placeholder="1800-3000" />
          <RHFNumber name={`${ X }.xmux.hKeepAlivePeriod`} label={t('pages.xray.outboundForm.keepAlivePeriod')} min={0} />
        </>
      )}
    </>
    );
}
