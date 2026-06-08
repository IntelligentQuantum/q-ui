import { useTranslation } from 'react-i18next';

import { HeaderMapEditor } from '@/components/form';
import { RHFText, RHFNumber, RHFSelect, RHFSwitch, RHFField, useWatch } from '@/components/form/rhf';

const X = 'streamSettings.xhttpSettings';
const PLACEMENTS = [
    { value: '', label: 'Default (path)' },
    { value: 'path', label: 'path' },
    { value: 'header', label: 'header' },
    { value: 'cookie', label: 'cookie' },
    { value: 'query', label: 'query' }
];

export default function XhttpForm()
{
    const { t } = useTranslation();
    const mode = useWatch({ name: `${ X }.mode` }) as string | undefined;
    const obfs = !!useWatch({ name: `${ X }.xPaddingObfsMode` });
    const sessionPlacement = useWatch({ name: `${ X }.sessionPlacement` }) as string | undefined;
    const seqPlacement = useWatch({ name: `${ X }.seqPlacement` }) as string | undefined;
    const uplinkPlacement = useWatch({ name: `${ X }.uplinkDataPlacement` }) as string | undefined;
    return (
    <>
      <RHFText name={`${ X }.host`} label={t('host')} />
      <RHFText name={`${ X }.path`} label={t('path')} />
      <RHFSelect
        name={`${ X }.mode`}
        label={t('pages.inbounds.info.mode')}
        options={['auto', 'packet-up', 'stream-up', 'stream-one'].map((m) => ({ value: m, label: m }))}
      />
      {mode === 'packet-up' && (
        <>
          <RHFNumber name={`${ X }.scMaxBufferedPosts`} label={t('pages.inbounds.form.maxBufferedUpload')} />
          <RHFText name={`${ X }.scMaxEachPostBytes`} label={t('pages.inbounds.form.maxUploadSize')} />
        </>
      )}
      {mode === 'stream-up' && <RHFText name={`${ X }.scStreamUpServerSecs`} label={t('pages.inbounds.form.streamUpServer')} />}
      <RHFNumber name={`${ X }.serverMaxHeaderBytes`} label={t('pages.inbounds.form.serverMaxHeaderBytes')} min={0} placeholder="0 (default)" />
      <RHFText name={`${ X }.xPaddingBytes`} label={t('pages.inbounds.form.paddingBytes')} />
      <RHFField
        name={`${ X }.headers`}
        label={t('pages.inbounds.form.headers')}
        render={({ value, onChange }) => (
          <HeaderMapEditor mode="v1" value={value as Record<string, string>} onChange={onChange} />
        )}
      />
      <RHFSelect
        name={`${ X }.uplinkHTTPMethod`}
        label={t('pages.inbounds.form.uplinkHttpMethod')}
        options={[
            { value: '', label: 'Default (POST)' },
            { value: 'POST', label: 'POST' },
            { value: 'PUT', label: 'PUT' },
            { value: 'GET', label: 'GET (packet-up only)', disabled: mode !== 'packet-up' }
        ]}
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
      <RHFSelect name={`${ X }.sessionPlacement`} label={t('pages.inbounds.form.sessionPlacement')} options={PLACEMENTS} />
      {sessionPlacement && sessionPlacement !== 'path' && (
        <RHFText name={`${ X }.sessionKey`} label={t('pages.inbounds.form.sessionKey')} placeholder="x_session" />
      )}
      <RHFSelect name={`${ X }.seqPlacement`} label={t('pages.inbounds.form.sequencePlacement')} options={PLACEMENTS} />
      {seqPlacement && seqPlacement !== 'path' && (
        <RHFText name={`${ X }.seqKey`} label={t('pages.inbounds.form.sequenceKey')} placeholder="x_seq" />
      )}
      {mode === 'packet-up' && (
        <>
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
          {uplinkPlacement && uplinkPlacement !== 'body' && (
            <RHFText name={`${ X }.uplinkDataKey`} label={t('pages.inbounds.form.uplinkDataKey')} placeholder="x_data" />
          )}
        </>
      )}
      <RHFSwitch name={`${ X }.noSSEHeader`} label={t('pages.inbounds.form.noSseHeader')} />
    </>
    );
}
