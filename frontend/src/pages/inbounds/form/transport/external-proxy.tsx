import { useTranslation } from 'react-i18next';
import { Plus, Trash2, RefreshCw } from 'lucide-react';

import { ALPN_OPTION, UTLS_FINGERPRINT } from '@/schemas/primitives';
import { Button, Checkbox, Label, Switch } from '@/components/ui';
import { RHFText, RHFNumber, RHFSelect, RHFTags, RHFField, useFormContext, useWatch } from '@/components/form/rhf';

const EP = 'streamSettings.externalProxy';

const newEntry = () => ({
    forceTls: 'same',
    dest: '',
    port: 443,
    remark: '',
    sni: '',
    fingerprint: '',
    alpn: [],
    pinnedPeerCertSha256: [],
    echConfigList: ''
});

function ExtProxyEntry({ index, onRemove, onGenPin }: { index: number; onRemove: () => void; onGenPin: () => void })
{
    const { t } = useTranslation();
    const forceTls = useWatch({ name: `${ EP }.${ index }.forceTls` }) as string | undefined;
    return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">#{index + 1}</span>
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
        name={`${ EP }.${ index }.forceTls`}
        label={t('pages.inbounds.form.forceTls')}
        options={[
            { value: 'same', label: t('pages.inbounds.same') },
            { value: 'none', label: t('none') },
            { value: 'tls', label: 'TLS' }
        ]}
      />
      <RHFText name={`${ EP }.${ index }.dest`} label={t('pages.inbounds.address')} placeholder={t('pages.inbounds.address')} />
      <RHFNumber name={`${ EP }.${ index }.port`} label={t('pages.inbounds.port')} min={1} max={65535} />
      <RHFText name={`${ EP }.${ index }.remark`} label={t('pages.inbounds.remark')} placeholder={t('pages.inbounds.remark')} />
      {forceTls === 'tls' && (
        <>
          <RHFText name={`${ EP }.${ index }.sni`} label="SNI" placeholder={t('pages.inbounds.form.serverNameIndication')} />
          <RHFSelect
            name={`${ EP }.${ index }.fingerprint`}
            label={t('pages.inbounds.form.fingerprint')}
            placeholder={t('pages.inbounds.form.fingerprint')}
            options={[
                { value: '', label: t('pages.inbounds.form.defaultOption') },
                ...Object.values(UTLS_FINGERPRINT).map((fp) => ({ value: fp, label: fp }))
            ]}
          />
          <RHFField
            name={`${ EP }.${ index }.alpn`}
            label="ALPN"
            render={({ value, onChange }) =>
            {
                const arr = Array.isArray(value) ? (value as string[]) : [];
                const toggle = (v: string) => onChange(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
                return (
                <div className="flex flex-wrap gap-3">
                  {Object.values(ALPN_OPTION).map((a) => (
                    <Checkbox key={a} checked={arr.includes(a)} onChange={() => toggle(a)}>
                      {a}
                    </Checkbox>
                  ))}
                </div>
                );
            }}
          />
          <RHFText name={`${ EP }.${ index }.echConfigList`} label={t('pages.inbounds.form.echConfig')} placeholder={t('pages.inbounds.form.echConfig')} />
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label>{t('pages.inbounds.form.pinnedPeerCertSha256')}</Label>
              <Button variant="secondary" size="icon" aria-label={t('pages.inbounds.form.generateRandomPin')} onClick={onGenPin}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            <RHFTags
              name={`${ EP }.${ index }.pinnedPeerCertSha256`}
              placeholder={t('pages.inbounds.form.pinnedPeerCertSha256Placeholder')}
            />
          </div>
        </>
      )}
    </div>
    );
}

export default function ExternalProxyForm({ toggleExternalProxy }: { toggleExternalProxy: (on: boolean) => void })
{
    const { t } = useTranslation();
    const { getValues, setValue } = useFormContext();
    // Toggled by the host via setValue, so watch the array directly rather than
    // useFieldArray (which would desync from an external setValue).
    const arr = (useWatch({ name: EP }) ?? []) as unknown[];
    const on = Array.isArray(arr) && arr.length > 0;

    const addEntry = () =>
    {
        const cur = (getValues(EP) ?? []) as unknown[];
        setValue(EP, [...cur, newEntry()]);
    };
    const removeEntry = (idx: number) =>
    {
        const cur = (getValues(EP) ?? []) as unknown[];
        setValue(EP, cur.filter((_, i) => i !== idx));
    };
    const generateRandomPin = (idx: number) =>
    {
        const bytes = new Uint8Array(32);
        crypto.getRandomValues(bytes);
        const hash = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
        const path = `${ EP }.${ idx }.pinnedPeerCertSha256`;
        const current = (getValues(path) as string[] | undefined) ?? [];
        setValue(path, [...current, hash]);
    };

    return (
    <>
      <div className="flex items-center justify-between gap-3">
        <Label>{t('pages.inbounds.form.externalProxy')}</Label>
        <Switch checked={on} aria-label={t('pages.inbounds.form.externalProxy')} onCheckedChange={toggleExternalProxy} />
      </div>
      {on && (
        <div className="flex flex-col gap-3">
          {arr.map((_, idx) => (
            <ExtProxyEntry key={idx} index={idx} onRemove={() => removeEntry(idx)} onGenPin={() => generateRandomPin(idx)} />
          ))}
          <Button variant="secondary" onClick={addEntry}>
            <Plus className="h-4 w-4" />
            {t('add')}
          </Button>
        </div>
      )}
    </>
    );
}
