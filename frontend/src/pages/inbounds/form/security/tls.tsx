import { useTranslation } from 'react-i18next';
import { Plus, Trash2, RefreshCw } from 'lucide-react';

import { ALPN_OPTION, TLS_CIPHER_OPTION, TLS_VERSION_OPTION, USAGE_OPTION, UTLS_FINGERPRINT } from '@/schemas/primitives';
import { Button, Checkbox, Label, Tabs, Textarea } from '@/components/ui';
import {
    RHFText,
    RHFNumber,
    RHFSelect,
    RHFSwitch,
    RHFTags,
    RHFField,
    Field,
    useFieldArray,
    useFormContext,
    useWatch
} from '@/components/form/rhf';

const TLS = 'streamSettings.tlsSettings';

interface TlsFormProps {
  saving: boolean;
  setCertFromPanel: (certName: number) => void;
  clearCertFiles: (certName: number) => void;
  generateRandomPinHash: () => void;
  getNewEchCert: () => void;
  clearEchCert: () => void;
}

function CertItem({
    index,
    canRemove,
    onRemove,
    saving,
    setCertFromPanel,
    clearCertFiles
}: {
  index: number;
  canRemove: boolean;
  onRemove: () => void;
  saving: boolean;
  setCertFromPanel: (n: number) => void;
  clearCertFiles: (n: number) => void;
})
{
    const { t } = useTranslation();
    const base = `${ TLS }.certificates.${ index }`;
    const useFile = useWatch({ name: `${ base }.useFile` });
    const usage = useWatch({ name: `${ base }.usage` }) as string | undefined;
    return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label>{`${ t('certificate') } ${ index + 1 }`}</Label>
          <RHFField
            name={`${ base }.useFile`}
            render={({ value, onChange }) => (
              <Tabs
                variant="segmented"
                value={value ? 'path' : 'content'}
                onChange={(k) => onChange(k === 'path')}
                tabs={[
                    { key: 'path', label: t('pages.inbounds.certificatePath') },
                    { key: 'content', label: t('pages.inbounds.certificateContent') }
                ]}
              />
            )}
          />
        </div>
        {canRemove && (
          <button
            type="button"
            aria-label={t('remove')}
            onClick={onRemove}
            className="mt-7 text-muted-foreground transition-colors hover:text-danger"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {useFile ? (
        <>
          <RHFText name={`${ base }.certificateFile`} label={t('pages.inbounds.publicKey')} />
          <RHFText name={`${ base }.keyFile`} label={t('pages.inbounds.privatekey')} />
          <div className="flex gap-2">
            <Button loading={saving} onClick={() => setCertFromPanel(index)}>
              {t('pages.inbounds.setDefaultCert')}
            </Button>
            <Button variant="danger" onClick={() => clearCertFiles(index)}>
              {t('clear')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <RHFField
            name={`${ base }.certificate`}
            label={t('pages.inbounds.publicKey')}
            render={({ value, onChange }) => (
              <Textarea
                rows={4}
                value={Array.isArray(value) ? value.join('\n') : ((value as string) ?? '')}
                onChange={(e) => onChange(e.target.value.split('\n'))}
              />
            )}
          />
          <RHFField
            name={`${ base }.key`}
            label={t('pages.inbounds.privatekey')}
            render={({ value, onChange }) => (
              <Textarea
                rows={4}
                value={Array.isArray(value) ? value.join('\n') : ((value as string) ?? '')}
                onChange={(e) => onChange(e.target.value.split('\n'))}
              />
            )}
          />
        </>
      )}
      <RHFNumber name={`${ base }.ocspStapling`} label="OCSP Stapling (s)" min={0} />
      <RHFSwitch name={`${ base }.oneTimeLoading`} label={t('pages.inbounds.form.oneTimeLoading')} />
      <RHFSelect
        name={`${ base }.usage`}
        label={t('pages.inbounds.form.usageOption')}
        options={Object.values(USAGE_OPTION).map((u) => ({ value: u, label: u }))}
      />
      {usage === 'issue' && <RHFSwitch name={`${ base }.buildChain`} label={t('pages.inbounds.form.buildChain')} />}
    </div>
    );
}

export default function TlsForm({
    saving,
    setCertFromPanel,
    clearCertFiles,
    generateRandomPinHash,
    getNewEchCert,
    clearEchCert
}: TlsFormProps)
{
    const { t } = useTranslation();
    const { control } = useFormContext();
    const { fields, append, remove } = useFieldArray({ control, name: `${ TLS }.certificates` });
    return (
    <>
      <RHFText name={`${ TLS }.serverName`} label="SNI" placeholder={t('pages.inbounds.form.serverNameIndication')} />
      <RHFSelect
        name={`${ TLS }.cipherSuites`}
        label={t('pages.inbounds.form.cipherSuites')}
        options={[
            { value: '', label: t('pages.inbounds.form.autoOption') },
            ...Object.entries(TLS_CIPHER_OPTION).map(([k, v]) => ({ value: v, label: k }))
        ]}
      />
      <Field label={t('pages.inbounds.form.minMaxVersion')}>
        <div className="grid grid-cols-2 gap-3">
          <RHFSelect
            name={`${ TLS }.minVersion`}
            options={Object.values(TLS_VERSION_OPTION).map((v) => ({ value: v, label: v }))}
          />
          <RHFSelect
            name={`${ TLS }.maxVersion`}
            options={Object.values(TLS_VERSION_OPTION).map((v) => ({ value: v, label: v }))}
          />
        </div>
      </Field>
      <RHFSelect
        name={`${ TLS }.settings.fingerprint`}
        label="uTLS"
        options={[{ value: '', label: 'None' }, ...Object.values(UTLS_FINGERPRINT).map((fp) => ({ value: fp, label: fp }))]}
      />
      <RHFField
        name={`${ TLS }.alpn`}
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
      <RHFSwitch name={`${ TLS }.rejectUnknownSni`} label={t('pages.inbounds.form.rejectUnknownSni')} />
      <RHFSwitch name={`${ TLS }.disableSystemRoot`} label={t('pages.inbounds.form.disableSystemRoot')} />
      <RHFSwitch name={`${ TLS }.enableSessionResumption`} label={t('pages.inbounds.form.sessionResumption')} />

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Label>{t('certificate')}</Label>
          <Button
            size="sm"
            variant="secondary"
            aria-label={t('add')}
            onClick={() =>
                append({
                    useFile: true,
                    certificateFile: '',
                    keyFile: '',
                    certificate: [],
                    key: [],
                    ocspStapling: 3600,
                    oneTimeLoading: false,
                    usage: 'encipherment',
                    buildChain: false
                })
            }
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {fields.map((field, idx) => (
          <CertItem
            key={field.id}
            index={idx}
            canRemove={fields.length > 1}
            onRemove={() => remove(idx)}
            saving={saving}
            setCertFromPanel={setCertFromPanel}
            clearCertFiles={clearCertFiles}
          />
        ))}
      </div>

      <RHFText name={`${ TLS }.echServerKeys`} label={t('pages.inbounds.form.echKey')} />
      <RHFText name={`${ TLS }.settings.echConfigList`} label={t('pages.inbounds.form.echConfig')} />
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label>{t('pages.inbounds.form.pinnedPeerCertSha256')}</Label>
          <Button
            variant="secondary"
            size="icon"
            aria-label={t('pages.inbounds.form.generateRandomPin')}
            onClick={generateRandomPinHash}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <RHFTags
          name={`${ TLS }.settings.pinnedPeerCertSha256`}
          placeholder={t('pages.inbounds.form.pinnedPeerCertSha256Placeholder')}
        />
      </div>
      <div className="flex gap-2">
        <Button loading={saving} onClick={getNewEchCert}>
          {t('pages.inbounds.form.getNewEchCert')}
        </Button>
        <Button variant="danger" onClick={clearEchCert}>
          {t('clear')}
        </Button>
      </div>
    </>
    );
}
