import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';

import { OutboundDomainStrategies } from '@/schemas/primitives';
import { Button, Label, Select, Switch } from '@/components/ui';
import {
    RHFText,
    RHFNumber,
    RHFSelect,
    RHFTags,
    RHFField,
    useFieldArray,
    useFormContext,
    useWatch
} from '@/components/form/rhf';

// Per-rule row: blockDelay only shows when action === 'block' (watched live).
function FinalRuleRow({ index, onRemove }: { index: number; onRemove: () => void })
{
    const { t } = useTranslation();
    const action = useWatch({ name: `settings.finalRules.${ index }.action` }) as string | undefined;
    return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{t('pages.xray.outboundForm.ruleN', { n: index + 1 })}</span>
        <button
          type="button"
          aria-label={t('delete')}
          onClick={onRemove}
          className="text-muted-foreground transition-colors hover:text-danger"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <RHFSelect
        name={`settings.finalRules.${ index }.action`}
        label={t('pages.xray.outboundForm.action')}
        options={['allow', 'block'].map((v) => ({ value: v, label: v }))}
      />
      <RHFSelect
        name={`settings.finalRules.${ index }.network`}
        label={t('pages.inbounds.network')}
        placeholder="(any)"
        options={[{ value: '', label: '(any)' }, ...['tcp', 'udp', 'tcp,udp'].map((v) => ({ value: v, label: v }))]}
      />
      <RHFText
        name={`settings.finalRules.${ index }.port`}
        label={t('pages.inbounds.port')}
        placeholder="e.g. 80,443 or 1000-2000"
      />
      <RHFTags name={`settings.finalRules.${ index }.ip`} label="IP / CIDR / geoip" placeholder="10.0.0.0/8, geoip:private" />
      {action === 'block' && (
        <RHFText
          name={`settings.finalRules.${ index }.blockDelay`}
          label={t('pages.xray.outboundForm.blockDelay')}
          placeholder="optional: 5000-10000"
        />
      )}
    </div>
    );
}

// `form` prop accepted (host still passes it) but unused — context drives everything.
export default function FreedomFields()
{
    const { t } = useTranslation();
    const { control, setValue } = useFormContext();

    const fragment = useWatch({ name: 'settings.fragment' }) as
    | { packets?: string; length?: string; interval?: string; maxSplit?: string }
    | undefined;
    const fragEnabled = !!(fragment?.length || fragment?.interval || fragment?.maxSplit);

    const noises = useFieldArray({ control, name: 'settings.noises' });
    const finalRules = useFieldArray({ control, name: 'settings.finalRules' });

    return (
    <>
      <RHFSelect
        name="settings.domainStrategy"
        label={t('pages.xray.balancer.balancerStrategy')}
        options={[
            { value: '', label: `(${ t('none') })` },
            ...OutboundDomainStrategies.map((s) => ({ value: s, label: s }))
        ]}
      />
      <RHFText name="settings.redirect" label={t('pages.xray.outboundForm.redirect')} />
      <RHFNumber name="settings.userLevel" label={t('pages.xray.tun.userLevel')} min={0} />
      <RHFField
        name="settings.proxyProtocol"
        label={t('pages.xray.outboundForm.proxyProtocol')}
        render={({ value, onChange }) => (
          <Select
            value={value == null ? '0' : String(value)}
            onChange={(v) => onChange(Number(v))}
            options={[
                { value: '0', label: `(${ t('none') })` },
                { value: '1', label: 'v1' },
                { value: '2', label: 'v2' }
            ]}
          />
        )}
      />

      {/* Fragment toggle (UI-only switch driving the fragment object). */}
      <div className="flex items-center justify-between gap-3">
        <Label>Fragment</Label>
        <Switch
          checked={fragEnabled}
          aria-label="Fragment"
          onCheckedChange={(c) =>
              setValue(
                  'settings.fragment',
                  c
                      ? { packets: 'tlshello', length: '100-200', interval: '10-20', maxSplit: '300-400' }
                      : { packets: '', length: '', interval: '', maxSplit: '' }
              )
          }
        />
      </div>
      {fragEnabled && (
        <>
          <RHFSelect
            name="settings.fragment.packets"
            label={t('pages.settings.subFormats.packets')}
            options={[
                { value: '1-3', label: '1-3' },
                { value: 'tlshello', label: 'tlshello' }
            ]}
          />
          <RHFText name="settings.fragment.length" label={t('pages.settings.subFormats.length')} />
          <RHFText name="settings.fragment.interval" label={t('pages.settings.subFormats.interval')} />
          <RHFText name="settings.fragment.maxSplit" label={t('pages.settings.subFormats.maxSplit')} />
        </>
      )}

      {/* Noises */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <Label>{t('pages.settings.subFormats.noises')}</Label>
          <Switch
            checked={noises.fields.length > 0}
            aria-label={t('pages.settings.subFormats.noises')}
            onCheckedChange={(c) =>
                c ? noises.append({ type: 'rand', packet: '10-20', delay: '10-16', applyTo: 'ip' }) : noises.replace([])
            }
          />
        </div>
        {noises.fields.length > 0 && (
          <Button
            size="sm"
            variant="secondary"
            className="self-start"
            aria-label={t('add')}
            onClick={() => noises.append({ type: 'rand', packet: '10-20', delay: '10-16', applyTo: 'ip' })}
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
        {noises.fields.map((field, index) => (
          <div key={field.id} className="flex flex-col gap-3 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t('pages.settings.subFormats.noiseItem', { n: index + 1 })}</span>
              {noises.fields.length > 1 && (
                <button
                  type="button"
                  aria-label={t('delete')}
                  onClick={() => noises.remove(index)}
                  className="text-muted-foreground transition-colors hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <RHFSelect
              name={`settings.noises.${ index }.type`}
              label={t('pages.settings.subFormats.type')}
              options={['rand', 'base64', 'str', 'hex'].map((v) => ({ value: v, label: v }))}
            />
            <RHFText name={`settings.noises.${ index }.packet`} label={t('pages.settings.subFormats.packet')} />
            <RHFText name={`settings.noises.${ index }.delay`} label={t('pages.settings.subFormats.delayMs')} />
            <RHFSelect
              name={`settings.noises.${ index }.applyTo`}
              label={t('pages.settings.subFormats.applyTo')}
              options={['ip', 'ipv4', 'ipv6'].map((v) => ({ value: v, label: v }))}
            />
          </div>
        ))}
      </div>

      {/* Final rules */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <Label>{t('pages.xray.outboundForm.finalRules')}</Label>
            <span className="text-xs text-muted-foreground">{t('pages.xray.outboundForm.overrideXrayPrivateIp')}</span>
          </div>
          <Button
            size="sm"
            variant="secondary"
            aria-label={t('add')}
            onClick={() => finalRules.append({ action: 'allow', network: '', port: '', ip: [], blockDelay: '' })}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {finalRules.fields.map((field, index) => (
          <FinalRuleRow key={field.id} index={index} onRemove={() => finalRules.remove(index)} />
        ))}
      </div>
    </>
    );
}
