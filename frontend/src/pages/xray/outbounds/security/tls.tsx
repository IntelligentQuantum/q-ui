import { useTranslation } from 'react-i18next';

import { Checkbox } from '@/components/ui';
import { RHFText, RHFSelect, RHFField } from '@/components/form/rhf';

import { ALPN_OPTIONS, UTLS_OPTIONS } from '../outbound-form-constants';

export default function TlsForm()
{
    const { t } = useTranslation();
    return (
    <>
      <RHFText
        name="streamSettings.tlsSettings.serverName"
        label="SNI"
        placeholder={t('pages.xray.outboundForm.serverNamePlaceholder')}
      />
      <RHFSelect
        name="streamSettings.tlsSettings.fingerprint"
        label="uTLS"
        placeholder={t('none')}
        options={[{ value: '', label: t('none') }, ...UTLS_OPTIONS]}
      />
      <RHFField
        name="streamSettings.tlsSettings.alpn"
        label="ALPN"
        render={({ value, onChange }) =>
        {
            const arr = Array.isArray(value) ? (value as string[]) : [];
            const toggle = (v: string) => onChange(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
            return (
            <div className="flex flex-wrap gap-4">
              {ALPN_OPTIONS.map((o) => (
                <Checkbox
                  key={String(o.value)}
                  checked={arr.includes(String(o.value))}
                  onChange={() => toggle(String(o.value))}
                >
                  {o.label}
                </Checkbox>
              ))}
            </div>
            );
        }}
      />
      <RHFText name="streamSettings.tlsSettings.echConfigList" label="ECH" />
      <RHFText
        name="streamSettings.tlsSettings.verifyPeerCertByName"
        label={t('pages.xray.outboundForm.verifyPeerName')}
        placeholder="cloudflare-dns.com"
      />
      <RHFText
        name="streamSettings.tlsSettings.pinnedPeerCertSha256"
        label={t('pages.xray.outboundForm.pinnedSha256')}
        placeholder="base64 SHA256"
      />
    </>
    );
}
