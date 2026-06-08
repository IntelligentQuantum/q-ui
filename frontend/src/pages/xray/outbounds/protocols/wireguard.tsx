import { useTranslation } from 'react-i18next';
import { RefreshCw, Plus, Trash2 } from 'lucide-react';

import { Wireguard } from '@/utils';
import { Button, Input, Label } from '@/components/ui';
import { WireguardDomainStrategy } from '@/schemas/primitives';
import {
    RHFText,
    RHFNumber,
    RHFSelect,
    RHFSwitch,
    RHFTags,
    Field,
    useFieldArray,
    useFormContext
} from '@/components/form/rhf';

// `form` prop is accepted (host still passes it) but unused — context drives everything.
export default function WireguardFields()
{
    const { t } = useTranslation();
    const { control, register, setValue } = useFormContext();
    const { fields, append, remove } = useFieldArray({ control, name: 'settings.peers' });

    return (
    <>
      <RHFText
        name="settings.address"
        label={t('pages.inbounds.address')}
        placeholder="comma-separated, e.g. 10.0.0.1,fd00::1"
      />
      <Field name="settings.secretKey" label={t('pages.inbounds.privatekey')}>
        <div className="flex gap-2">
          <Input className="flex-1" {...register('settings.secretKey')} />
          <Button
            variant="secondary"
            size="icon"
            aria-label={t('regenerate')}
            onClick={() =>
            {
                const pair = Wireguard.generateKeypair();
                setValue('settings.secretKey', pair.privateKey);
                setValue('settings.pubKey', pair.publicKey);
            }}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </Field>
      <RHFText name="settings.pubKey" label={t('pages.inbounds.publicKey')} disabled />
      <RHFSelect
        name="settings.domainStrategy"
        label={t('pages.xray.wireguard.domainStrategy')}
        options={[
            { value: '', label: `(${ t('none') })` },
            ...WireguardDomainStrategy.map((s) => ({ value: s, label: s }))
        ]}
      />
      <RHFNumber name="settings.mtu" label="MTU" min={0} />
      <RHFNumber name="settings.workers" label={t('pages.xray.outboundForm.workers')} min={0} />
      <RHFSwitch name="settings.noKernelTun" label={t('pages.inbounds.info.noKernelTun')} />
      <RHFText
        name="settings.reserved"
        label={t('pages.xray.outboundForm.reserved')}
        placeholder="comma-separated bytes, e.g. 1,2,3"
      />

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Label>{t('pages.inbounds.form.peers')}</Label>
          <Button
            size="sm"
            variant="secondary"
            aria-label={t('add')}
            onClick={() =>
                append({ publicKey: '', psk: '', allowedIPs: ['0.0.0.0/0', '::/0'], endpoint: '', keepAlive: 0 })
            }
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {fields.map((field, index) => (
          <div key={field.id} className="flex flex-col gap-3 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t('pages.inbounds.info.peerNumber', { n: index + 1 })}</span>
              {fields.length > 1 && (
                <button
                  type="button"
                  aria-label={t('delete')}
                  onClick={() => remove(index)}
                  className="text-muted-foreground transition-colors hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <RHFText name={`settings.peers.${ index }.endpoint`} label={t('pages.xray.wireguard.endpoint')} />
            <RHFText name={`settings.peers.${ index }.publicKey`} label={t('pages.inbounds.publicKey')} />
            <RHFText name={`settings.peers.${ index }.psk`} label="PSK" />
            <RHFTags
              name={`settings.peers.${ index }.allowedIPs`}
              label={t('pages.xray.wireguard.allowedIPs')}
              placeholder="0.0.0.0/0"
            />
            <RHFNumber name={`settings.peers.${ index }.keepAlive`} label={t('pages.inbounds.info.keepAlive')} min={0} />
          </div>
        ))}
      </div>
    </>
    );
}
