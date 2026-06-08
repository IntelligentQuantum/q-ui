import { useTranslation } from 'react-i18next';

import { RHFNumber, RHFSelect, RHFSwitch, useWatch } from '@/components/form/rhf';

import { isMuxAllowed } from '../outbound-form-helpers';

interface MuxFormProps {
  protocol: string;
  network: string;
}

export default function MuxForm({ protocol, network }: MuxFormProps)
{
    const { t } = useTranslation();
    const flow = (useWatch({ name: 'settings.flow' }) ?? '') as string;
    const muxEnabled = !!useWatch({ name: 'mux.enabled' });
    if (!isMuxAllowed(protocol, flow, network))
    {
        return null;
    }
    return (
    <>
      <RHFSwitch name="mux.enabled" label={t('pages.settings.mux')} />
      {muxEnabled && (
        <>
          <RHFNumber name="mux.concurrency" label={t('pages.settings.subFormats.concurrency')} min={-1} max={1024} />
          <RHFNumber
            name="mux.xudpConcurrency"
            label={t('pages.settings.subFormats.xudpConcurrency')}
            min={-1}
            max={1024}
          />
          <RHFSelect
            name="mux.xudpProxyUDP443"
            label={t('pages.settings.subFormats.xudpUdp443')}
            options={['reject', 'allow', 'skip'].map((v) => ({ value: v, label: v }))}
          />
        </>
      )}
    </>
    );
}
