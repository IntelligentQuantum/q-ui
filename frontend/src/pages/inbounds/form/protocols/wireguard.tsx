import { useTranslation } from 'react-i18next';
import { RefreshCw, Plus, Minus } from 'lucide-react';

import { Wireguard } from '@/utils';
import { Button, Input, Label } from '@/components/ui';
import { RHFText, RHFNumber, RHFSwitch, RHFTags, Field, useFieldArray, useFormContext } from '@/components/form/rhf';

interface WireguardFieldsProps {
  wgPubKey: string;
  regenInboundWg: () => void;
  regenWgPeerKeypair: (name: number) => void;
}

function nextWgPeerAllowedIP(peers: Array<{ allowedIPs?: string[] }> | undefined): string
{
    const fallback = '10.0.0.2/32';
    let maxInt = -1;
    let prefix = 32;
    for (const peer of peers ?? [])
    {
        for (const ip of peer?.allowedIPs ?? [])
        {
            const m = /^\s*(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?\s*$/.exec(String(ip));
            if (!m)
            {
                continue;
            }
            const octets = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
            if (octets.some((o) => o > 255))
            {
                continue;
            }
            const asInt = octets[0] * 16777216 + octets[1] * 65536 + octets[2] * 256 + octets[3];
            if (asInt > maxInt)
            {
                maxInt = asInt;
                prefix = m[5] !== undefined ? Math.min(Number(m[5]), 32) : 32;
            }
        }
    }
    if (maxInt < 0)
    {
        return fallback;
    }
    const next = maxInt + 1;
    const a = Math.floor(next / 16777216) % 256;
    const b = Math.floor(next / 65536) % 256;
    const c = Math.floor(next / 256) % 256;
    const d = next % 256;
    return `${ a }.${ b }.${ c }.${ d }/${ prefix }`;
}

export default function WireguardFields({ wgPubKey, regenInboundWg, regenWgPeerKeypair }: WireguardFieldsProps)
{
    const { t } = useTranslation();
    const { control, register, getValues } = useFormContext();
    const { fields, append, remove } = useFieldArray({ control, name: 'settings.peers' });
    return (
    <>
      <Field name="settings.secretKey" label={t('pages.xray.wireguard.secretKey')}>
        <div className="flex gap-2">
          <Input className="flex-1" {...register('settings.secretKey')} />
          <Button variant="secondary" size="icon" aria-label={t('regenerate')} onClick={regenInboundWg}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </Field>
      <Field label={t('pages.xray.wireguard.publicKey')}>
        <Input value={wgPubKey} disabled />
      </Field>
      <RHFNumber name="settings.mtu" label="MTU" />
      <RHFSwitch name="settings.noKernelTun" label={t('pages.inbounds.info.noKernelTun')} />

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Label>{t('pages.inbounds.form.peers')}</Label>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
            {
                const kp = Wireguard.generateKeypair();
                const peers = getValues('settings.peers') as Array<{ allowedIPs?: string[] }> | undefined;
                append({ privateKey: kp.privateKey, publicKey: kp.publicKey, allowedIPs: [nextWgPeerAllowedIP(peers)], keepAlive: 0 });
            }}
          >
            <Plus className="h-4 w-4" />
            {t('pages.inbounds.form.addPeer')}
          </Button>
        </div>
        {fields.map((field, idx) => (
          <div key={field.id} className="flex flex-col gap-3 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t('pages.inbounds.info.peerNumber', { n: idx + 1 })}</span>
              {fields.length > 1 && (
                <button
                  type="button"
                  aria-label={t('remove')}
                  onClick={() => remove(idx)}
                  className="text-muted-foreground transition-colors hover:text-danger"
                >
                  <Minus className="h-4 w-4" />
                </button>
              )}
            </div>
            <RHFText name={`settings.peers.${ idx }.comment`} label={t('pages.clients.comment')} />
            <Field name={`settings.peers.${ idx }.privateKey`} label={t('pages.xray.wireguard.secretKey')}>
              <div className="flex gap-2">
                <Input className="flex-1" {...register(`settings.peers.${ idx }.privateKey`)} />
                <Button variant="secondary" size="icon" aria-label={t('regenerate')} onClick={() => regenWgPeerKeypair(idx)}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </Field>
            <RHFText name={`settings.peers.${ idx }.publicKey`} label={t('pages.xray.wireguard.publicKey')} />
            <RHFText name={`settings.peers.${ idx }.preSharedKey`} label="PSK" />
            <RHFTags name={`settings.peers.${ idx }.allowedIPs`} label={t('pages.xray.wireguard.allowedIPs')} />
            <RHFNumber name={`settings.peers.${ idx }.keepAlive`} label={t('pages.inbounds.form.keepAlive')} min={0} />
          </div>
        ))}
      </div>
    </>
    );
}
