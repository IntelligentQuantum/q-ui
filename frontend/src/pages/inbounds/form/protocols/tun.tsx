import { useTranslation } from 'react-i18next';

import { RHFText, RHFNumber, RHFTags } from '@/components/form/rhf';

export default function TunFields()
{
    const { t } = useTranslation();
    return (
    <>
      <RHFText name="settings.name" label={t('pages.inbounds.info.interfaceName')} placeholder="xray0" />
      <RHFNumber name="settings.mtu" label="MTU" min={0} />
      <RHFTags name="settings.gateway" label={t('pages.inbounds.info.gateway')} placeholder="10.0.0.1/16" />
      <RHFTags name="settings.dns" label="DNS" placeholder="1.1.1.1" />
      <RHFNumber name="settings.userLevel" label={t('pages.xray.tun.userLevel')} min={0} />
      <RHFTags
        name="settings.autoSystemRoutingTable"
        label={t('pages.inbounds.info.autoSystemRoutes')}
        hint={t('pages.inbounds.form.autoSystemRoutesTooltip')}
        placeholder="0.0.0.0/0"
      />
      <RHFText
        name="settings.autoOutboundsInterface"
        label={t('pages.inbounds.form.autoOutboundsInterface')}
        hint={t('pages.inbounds.form.autoOutboundsInterfaceTooltip')}
        placeholder="auto"
      />
    </>
    );
}
