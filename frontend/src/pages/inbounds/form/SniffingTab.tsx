import { useTranslation } from 'react-i18next';

import { SNIFFING_OPTION } from '@/schemas/primitives';
import { Checkbox } from '@/components/ui';
import { RHFSwitch, RHFTags, RHFField } from '@/components/form/rhf';

export default function SniffingTab({ sniffingEnabled }: { sniffingEnabled: boolean })
{
    const { t } = useTranslation();
    return (
    <>
      <RHFSwitch name="sniffing.enabled" label={t('enable')} />
      {sniffingEnabled && (
        <>
          <RHFField
            name="sniffing.destOverride"
            render={({ value, onChange }) =>
            {
                const arr = Array.isArray(value) ? (value as string[]) : [];
                const toggle = (v: string) => onChange(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
                return (
                <div className="flex flex-wrap gap-3">
                  {Object.entries(SNIFFING_OPTION).map(([k, v]) => (
                    <Checkbox key={k} checked={arr.includes(v)} onChange={() => toggle(v)}>
                      {k}
                    </Checkbox>
                  ))}
                </div>
                );
            }}
          />
          <RHFSwitch name="sniffing.metadataOnly" label={t('pages.inbounds.sniffingMetadataOnly')} />
          <RHFSwitch name="sniffing.routeOnly" label={t('pages.inbounds.sniffingRouteOnly')} />
          <RHFTags name="sniffing.ipsExcluded" label={t('pages.inbounds.sniffingIpsExcluded')} placeholder="IP/CIDR/geoip:*/ext:*" />
          <RHFTags name="sniffing.domainsExcluded" label={t('pages.inbounds.sniffingDomainsExcluded')} placeholder="domain:*/ext:*" />
        </>
      )}
    </>
    );
}
