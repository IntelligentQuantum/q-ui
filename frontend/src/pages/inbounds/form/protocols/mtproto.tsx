import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';

import { generateMtprotoSecret, mtprotoSecretForDomain } from '@/lib/xray/inbound-defaults';
import { Button, Input } from '@/components/ui';
import { Field, RHFField, RHFNumber, RHFSelect, RHFSwitch, RHFText, useFormContext } from '@/components/form/rhf';

// MTProto (Telegram) inbound editor. mtproto is served by an mtg sidecar, not
// Xray, so there are no clients or stream settings — just the FakeTLS secret
// (kept in sync with the domain) and the optional mtg knobs.
export default function MtprotoFields()
{
    const { t } = useTranslation();
    const { register, getValues, setValue } = useFormContext();
    return (
    <>
      <RHFField
        name="settings.fakeTlsDomain"
        label={t('pages.inbounds.form.fakeTlsDomain')}
        render={({ value, onChange }) => (
          <Input
            value={(value as string) ?? ''}
            placeholder="www.cloudflare.com"
            onChange={(e) =>
            {
                const domain = e.target.value;
                onChange(domain);
                // Keep the FakeTLS secret's domain suffix in sync as the user types.
                const current = (getValues('settings.secret') as string) ?? '';
                setValue('settings.secret', mtprotoSecretForDomain(current, domain));
            }}
          />
        )}
      />

      <Field name="settings.secret" label={t('pages.inbounds.form.mtprotoSecret')}>
        <div className="flex gap-2">
          <Input className="flex-1 font-mono text-xs" readOnly {...register('settings.secret')} />
          <Button
            variant="secondary"
            size="icon"
            aria-label={t('regenerate')}
            onClick={() =>
            {
                const domain = (getValues('settings.fakeTlsDomain') as string) ?? '';
                setValue('settings.secret', generateMtprotoSecret(domain));
            }}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </Field>

      <RHFText
        name="settings.domainFronting.ip"
        label={t('pages.inbounds.form.mtgDomainFrontingIp')}
        hint={t('pages.inbounds.form.mtgDomainFrontingHint')}
        placeholder="127.0.0.1"
      />
      <RHFNumber
        name="settings.domainFronting.port"
        label={t('pages.inbounds.form.mtgDomainFrontingPort')}
        min={0}
        max={65535}
        placeholder="443"
      />
      <RHFSwitch name="settings.domainFronting.proxyProtocol" label={t('pages.inbounds.form.mtgDomainFrontingProxyProtocol')} />
      <RHFSwitch name="settings.proxyProtocolListener" label={t('pages.inbounds.form.mtgProxyProtocolListener')} />
      <RHFSelect
        name="settings.preferIp"
        label={t('pages.inbounds.form.mtgPreferIp')}
        options={[
            { value: '', label: t('none') },
            { value: 'prefer-ipv6', label: 'prefer-ipv6' },
            { value: 'prefer-ipv4', label: 'prefer-ipv4' },
            { value: 'only-ipv6', label: 'only-ipv6' },
            { value: 'only-ipv4', label: 'only-ipv4' }
        ]}
      />
      <RHFSwitch name="settings.debug" label={t('pages.inbounds.form.mtgDebug')} />
    </>
    );
}
