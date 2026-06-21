import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { message } from '@/components/ui/message';

import FinalMaskFormRhf from '@/lib/xray/forms/transport/FinalMaskFormRhf';
import { JsonEditor } from '@/components/form';
import { Wireguard } from '@/utils';
import { Button, Checkbox, Input, Label, Modal, Select, Tabs } from '@/components/ui';
import {
    FormProvider,
    useForm,
    RHFText,
    RHFNumber,
    RHFSelect,
    RHFSwitch,
    RHFTags,
    RHFField,
    Field,
    zodRule
} from '@/components/form/rhf';
import {
    XMUX_DEFAULTS,
    formValuesToWirePayload,
    rawOutboundToFormValues
} from '@/lib/xray/outbound-form-adapter';
import { parseOutboundLink } from '@/lib/xray/outbound-link-parser';
import { OutboundFormBaseSchema, type OutboundFormValues } from '@/schemas/forms/outbound-form';
import { SNIFFING_OPTION } from '@/schemas/primitives';
import { canEnableReality, canEnableStream, canEnableTls, canEnableTlsFlow } from '@/lib/xray/protocol-capabilities';

import {
    FLOW_OPTIONS,
    HYSTERIA_NETWORK_OPTION,
    NETWORK_OPTIONS,
    PROTOCOL_OPTIONS,
    SERVER_PROTOCOLS
} from './outbound-form-constants';
import { applyNetworkChange, buildAddModeValues, hysteriaStreamSlice, newStreamSlice } from './outbound-form-helpers';
import {
    BlackholeFields,
    DnsFields,
    FreedomFields,
    HttpFields,
    LoopbackFields,
    ServerTarget,
    ShadowsocksFields,
    SocksFields,
    TrojanFields,
    VlessFields,
    VmessFields,
    WireguardFields
} from './protocols';
import { GrpcForm, HttpUpgradeForm, HysteriaForm, KcpForm, MuxForm, RawForm, SockoptForm, WsForm, XhttpForm } from './transport';
import { RealityForm, TlsForm } from './security';

interface OutboundFormModalProps {
  open: boolean;
  outbound: Record<string, unknown> | null;
  existingTags: string[];
  onClose: () => void;
  onConfirm: (outbound: Record<string, unknown>) => void;
}

export default function OutboundFormModal({ open, outbound: outboundProp, existingTags, onClose, onConfirm }: OutboundFormModalProps)
{
    const { t } = useTranslation();
    const [messageApi] = message.useMessage();
    const methods = useForm<OutboundFormValues>({ defaultValues: buildAddModeValues() });
    const { watch, getValues, setValue, reset, register, trigger } = methods;
    // The stream cascades build loose objects (the AntD original used untyped
    // setFieldValue); streamSettings is a strict discriminated union, so cast.
    const setStream = (v: unknown) => setValue('streamSettings', v as OutboundFormValues['streamSettings']);
    const [activeKey, setActiveKey] = useState('1');
    const [jsonText, setJsonText] = useState('');
    const [jsonDirty, setJsonDirty] = useState(false);
    const [linkInput, setLinkInput] = useState('');

    const isEdit = outboundProp != null;
    const title = isEdit ? `${ t('edit') } ${ t('pages.xray.Outbounds') }` : `+ ${ t('pages.xray.Outbounds') }`;
    const okText = isEdit ? t('pages.clients.submitEdit') : t('create');

    useEffect(() =>
    {
        if (!open)
        {
            return;
        }
        const initial = outboundProp ? rawOutboundToFormValues(outboundProp) : buildAddModeValues();
        reset(initial as OutboundFormValues);
        setActiveKey('1');
        setJsonText(JSON.stringify(formValuesToWirePayload(initial), null, 2));
        setJsonDirty(false);
    }, [open, outboundProp]);

    const tag = (watch('tag') ?? '') as string;
    const protocol = (watch('protocol') ?? 'vless') as string;
    const network = (watch('streamSettings.network') ?? '') as string;
    const security = (watch('streamSettings.security') ?? 'none') as string;
    const flow = (watch('settings.flow') ?? '') as string;
    const reverseTag = watch('settings.reverseTag');
    const reverseSniffingEnabled = !!watch('settings.reverseSniffing.enabled');

    const streamAllowed = canEnableStream({ protocol });
    const tlsAllowed = canEnableTls({ protocol, streamSettings: { network, security } });
    const realityAllowed = canEnableReality({ protocol, streamSettings: { network, security } });
    const tlsFlowAllowed = canEnableTlsFlow({ protocol, streamSettings: { network, security } });

    useEffect(() =>
    {
        if (!streamAllowed || network)
        {
            return;
        }
        setStream({ ...newStreamSlice('tcp'), security: 'none' });
    }, [streamAllowed, network]);

    useEffect(() =>
    {
        if (protocol !== 'hysteria')
        {
            return;
        }
        if (network === 'hysteria' && security === 'tls')
        {
            return;
        }
        const existing = (getValues('streamSettings') ?? {}) as Record<string, unknown>;
        const slice = hysteriaStreamSlice();
        if (existing.hysteriaSettings)
        {
            slice.hysteriaSettings = existing.hysteriaSettings;
        }
        if (existing.tlsSettings)
        {
            slice.tlsSettings = existing.tlsSettings;
        }
        setStream(slice);
    }, [protocol, network, security]);

    const wgSecretKey = watch('settings.secretKey') as string | undefined;
    useEffect(() =>
    {
        if (protocol !== 'wireguard')
        {
            return;
        }
        const sk = (wgSecretKey ?? '').trim();
        if (!sk)
        {
            setValue('settings.pubKey', '');
            return;
        }
        try
        {
            const { publicKey } = Wireguard.generateKeypair(sk);
            setValue('settings.pubKey', publicKey);
        }
        catch
        {
            setValue('settings.pubKey', '');
        }
    }, [protocol, wgSecretKey]);

    function applyProtocol(next: string)
    {
        const nextSettings = rawOutboundToFormValues({ protocol: next }).settings;
        setValue('settings', nextSettings);
        if (next === 'hysteria')
        {
            setStream(hysteriaStreamSlice());
        }
        else if (((getValues('streamSettings.network') as string) ?? '') === 'hysteria')
        {
            setStream({ ...newStreamSlice('tcp'), security: 'none' });
        }
    }

    function onNetworkChange(next: string)
    {
        const stream = (getValues('streamSettings') ?? {}) as Record<string, unknown>;
        setStream(applyNetworkChange(protocol, stream, next));
    }

    function onSecurityChange(next: string)
    {
        const stream = (getValues('streamSettings') ?? {}) as Record<string, unknown>;
        const cleaned = { ...stream } as Record<string, unknown>;
        delete cleaned.tlsSettings;
        delete cleaned.realitySettings;
        if (next === 'tls')
        {
            cleaned.tlsSettings = {
                serverName: '',
                alpn: [],
                fingerprint: '',
                echConfigList: '',
                verifyPeerCertByName: '',
                pinnedPeerCertSha256: ''
            };
        }
        else if (next === 'reality')
        {
            cleaned.realitySettings = {
                publicKey: '',
                fingerprint: 'chrome',
                serverName: '',
                shortId: '',
                spiderX: '',
                mldsa65Verify: ''
            };
        }
        cleaned.security = next;
        setStream(cleaned);
    }

    function onXmuxToggle(checked: boolean)
    {
        if (!checked)
        {
            return;
        }
        const existing = getValues('streamSettings.xhttpSettings.xmux');
        const hasValues = existing && typeof existing === 'object' && Object.keys(existing).length > 0;
        if (hasValues)
        {
            return;
        }
        setValue('streamSettings.xhttpSettings.xmux', { ...XMUX_DEFAULTS });
    }

    const duplicateTag = useMemo(() =>
    {
        const myTag = tag.trim();
        if (!myTag)
        {
            return false;
        }
        if (isEdit && (outboundProp?.tag as string | undefined) === myTag)
        {
            return false;
        }
        return (existingTags || []).includes(myTag);
    }, [tag, existingTags, isEdit, outboundProp]);

    function applyJsonToForm(): boolean
    {
        if (!jsonDirty)
        {
            return true;
        }
        const raw = jsonText.trim();
        if (!raw)
        {
            return true;
        }
        let parsed: Record<string, unknown>;
        try
        {
            parsed = JSON.parse(raw) as Record<string, unknown>;
        }
        catch (e)
        {
            messageApi.error(`JSON: ${ (e as Error).message }`);
            return false;
        }
        reset(rawOutboundToFormValues(parsed) as OutboundFormValues);
        setJsonDirty(false);
        return true;
    }

    function onTabChange(key: string)
    {
        if (key === '2')
        {
            setJsonText(JSON.stringify(formValuesToWirePayload(getValues()), null, 2));
            setJsonDirty(false);
            setActiveKey('2');
            return;
        }
        if (key === '1' && activeKey === '2' && !applyJsonToForm())
        {
            return;
        }
        setActiveKey('1');
    }

    function importLink()
    {
        const link = linkInput.trim();
        if (!link)
        {
            return;
        }
        const parsed = parseOutboundLink(link);
        if (!parsed)
        {
            messageApi.error('Wrong Link!');
            return;
        }
        const currentTag = getValues('tag') as string | undefined;
        if (!parsed.tag && currentTag)
        {
            parsed.tag = currentTag;
        }
        const next = rawOutboundToFormValues(parsed);
        reset(next as OutboundFormValues);
        setJsonText(JSON.stringify(formValuesToWirePayload(next), null, 2));
        setJsonDirty(false);
        setLinkInput('');
        messageApi.success('Link imported successfully');
        setActiveKey('1');
    }

    async function onOk()
    {
        let values: OutboundFormValues;
        if (activeKey === '2')
        {
            const raw = jsonText.trim();
            if (!raw)
            {
                return;
            }
            let parsed: Record<string, unknown>;
            try
            {
                parsed = JSON.parse(raw) as Record<string, unknown>;
            }
            catch (e)
            {
                messageApi.error(`JSON: ${ (e as Error).message }`);
                return;
            }
            values = rawOutboundToFormValues(parsed) as OutboundFormValues;
            reset(values);
            setJsonDirty(false);
        }
        else
        {
            if (!(await trigger()))
            {
                return;
            }
            values = getValues();
        }
        const tagValue = (values.tag ?? '').trim();
        if (!tagValue)
        {
            messageApi.error(t('pages.xray.outboundForm.tagRequired'));
            return;
        }
        const isDuplicateTag =
      (existingTags || []).includes(tagValue) && !(isEdit && (outboundProp?.tag as string | undefined) === tagValue);
        if (isDuplicateTag)
        {
            messageApi.error('Tag already used by another outbound');
            return;
        }
        onConfirm(formValuesToWirePayload(values));
    }

    const securityTabs = [
        ...(network !== 'hysteria' ? [{ key: 'none', label: t('none') }] : []),
        ...(tlsAllowed ? [{ key: 'tls', label: 'TLS' }] : []),
        ...(realityAllowed ? [{ key: 'reality', label: 'Reality' }] : [])
    ];

    return (
    <>
      <FormProvider {...methods}>
        <Modal
          open={open}
          onClose={onClose}
          title={title}
          size="xl"
          closeOnOverlay={false}
          footer={
            <>
              <Button variant="secondary" onClick={onClose}>
                {t('close')}
              </Button>
              <Button onClick={onOk}>{okText}</Button>
            </>
          }
        >
          <Tabs
            value={activeKey}
            onChange={onTabChange}
            tabs={[
                { key: '1', label: t('pages.xray.basicTemplate') },
                { key: '2', label: 'JSON' }
            ]}
          />

          {activeKey === '1' ? (
            <div className="flex flex-col gap-4 pt-4">
              <RHFField
                name="protocol"
                label={t('protocol')}
                rules={zodRule(OutboundFormBaseSchema.shape.tag, t)}
                render={({ value, onChange }) => (
                  <Select
                    value={(value as string) ?? 'vless'}
                    onChange={(v) =>
                    {
                        onChange(v);
                        applyProtocol(v);
                    }}
                    options={PROTOCOL_OPTIONS}
                  />
                )}
              />

              <div className="flex flex-col gap-1.5">
                <RHFText
                  name="tag"
                  label={t('pages.xray.outbound.tag')}
                  placeholder={t('pages.xray.outboundForm.tagPlaceholder')}
                  rules={{ required: t('pages.xray.outboundForm.tagRequired') }}
                />
                {duplicateTag && <span className="text-xs text-warning">{t('pages.xray.outboundForm.tagDuplicate')}</span>}
              </div>

              <RHFText
                name="sendThrough"
                label={t('pages.xray.outbound.sendThrough')}
                placeholder={t('pages.xray.outboundForm.localIpPlaceholder')}
              />

              {SERVER_PROTOCOLS.has(protocol) && <ServerTarget />}
              {protocol === 'vmess' && <VmessFields />}
              {protocol === 'vless' && <VlessFields />}
              {protocol === 'trojan' && <TrojanFields />}
              {protocol === 'shadowsocks' && <ShadowsocksFields />}
              {protocol === 'http' && <HttpFields />}
              {protocol === 'socks' && <SocksFields />}
              {protocol === 'loopback' && <LoopbackFields />}
              {protocol === 'blackhole' && <BlackholeFields />}
              {protocol === 'dns' && <DnsFields />}
              {protocol === 'freedom' && <FreedomFields />}

              {protocol === 'vless' && reverseTag ? (
                <>
                  <RHFSwitch name="settings.reverseSniffing.enabled" label={t('pages.xray.outboundForm.reverseSniffing')} />
                  {reverseSniffingEnabled && (
                    <>
                      <RHFField
                        name="settings.reverseSniffing.destOverride"
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
                      <RHFSwitch name="settings.reverseSniffing.metadataOnly" label={t('pages.inbounds.sniffingMetadataOnly')} />
                      <RHFSwitch name="settings.reverseSniffing.routeOnly" label={t('pages.inbounds.sniffingRouteOnly')} />
                      <RHFTags name="settings.reverseSniffing.ipsExcluded" label={t('pages.inbounds.sniffingIpsExcluded')} placeholder="IP/CIDR/geoip:*" />
                      <RHFTags name="settings.reverseSniffing.domainsExcluded" label={t('pages.inbounds.sniffingDomainsExcluded')} placeholder="domain:*" />
                    </>
                  )}
                </>
              ) : null}

              {protocol === 'wireguard' && <WireguardFields />}

              {streamAllowed && network && (
                <>
                  <RHFField
                    name="streamSettings.network"
                    label={t('transmission')}
                    render={({ value }) => (
                      <Select
                        value={(value as string) ?? ''}
                        onChange={onNetworkChange}
                        options={protocol === 'hysteria' ? [HYSTERIA_NETWORK_OPTION] : NETWORK_OPTIONS}
                      />
                    )}
                  />
                  {network === 'tcp' && <RawForm />}
                  {network === 'kcp' && <KcpForm />}
                  {network === 'ws' && <WsForm />}
                  {network === 'grpc' && <GrpcForm />}
                  {network === 'httpupgrade' && <HttpUpgradeForm />}
                  {network === 'xhttp' && <XhttpForm onXmuxToggle={onXmuxToggle} />}
                  {network === 'hysteria' && <HysteriaForm />}
                </>
              )}

              {tlsFlowAllowed && (
                <RHFSelect
                  name="settings.flow"
                  label={t('pages.clients.flow')}
                  placeholder={t('none')}
                  options={[{ value: '', label: t('none') }, ...FLOW_OPTIONS]}
                />
              )}

              {tlsFlowAllowed && flow === 'xtls-rprx-vision' && (
                <>
                  <RHFNumber name="settings.testpre" label={t('pages.xray.outboundForm.visionTestpre')} min={0} />
                  <Field label={t('pages.inbounds.form.visionTestseed')}>
                    <div className="flex gap-2">
                      {[0, 1, 2, 3].map((i) => (
                        <Input key={i} type="number" min={1} {...register(`settings.testseed.${ i }`, { valueAsNumber: true })} />
                      ))}
                    </div>
                  </Field>
                </>
              )}

              {streamAllowed && network && securityTabs.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <Label>{t('security')}</Label>
                  <Tabs variant="segmented" tabs={securityTabs} value={security} onChange={onSecurityChange} />
                </div>
              )}
              {security === 'tls' && tlsAllowed && <TlsForm />}
              {security === 'reality' && realityAllowed && <RealityForm />}

              {((streamAllowed && network) || !streamAllowed) && <SockoptForm outboundTags={existingTags} />}

              <FinalMaskFormRhf name="streamSettings.finalmask" network={network} protocol={protocol} />

              <MuxForm protocol={protocol} network={network} />
            </div>
          ) : (
            <div className="flex flex-col gap-3 pt-4">
              <div className="flex gap-2">
                <Input
                  className="flex-1"
                  value={linkInput}
                  placeholder="vmess:// vless:// trojan:// ss:// hysteria2:// wireguard://"
                  onChange={(e) => setLinkInput(e.target.value)}
                  onKeyDown={(e) =>
                  {
                      if (e.key === 'Enter')
                      {
                          e.preventDefault();
                          importLink();
                      }
                  }}
                />
                <Button variant="secondary" onClick={importLink}>
                  Import
                </Button>
              </div>
              <JsonEditor
                value={jsonText}
                onChange={(next) =>
                {
                    setJsonText(next);
                    setJsonDirty(true);
                }}
                minHeight="360px"
                maxHeight="600px"
              />
            </div>
          )}
        </Modal>
      </FormProvider>
    </>
    );
}
