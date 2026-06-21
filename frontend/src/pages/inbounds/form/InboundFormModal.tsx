import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { message } from '@/components/ui/message';

import { HttpUtil, NumberFormatter, RandomUtil, SizeFormatter, Wireguard } from '@/utils';
import { rawInboundToFormValues, formValuesToWirePayload } from '@/lib/xray/inbound-form-adapter';
import { createDefaultInboundSettings } from '@/lib/xray/inbound-defaults';
import { composeInboundTag, isAutoInboundTag, type InboundTagInput } from '@/lib/xray/inbound-tag';
import { canEnableReality, canEnableStream, canEnableTls, isSS2022 } from '@/lib/xray/protocol-capabilities';
import { InboundFormBaseSchema, InboundFormSchema, type InboundFormValues } from '@/schemas/forms/inbound-form';
import { Protocols } from '@/schemas/primitives';
import { SockoptStreamSettingsSchema } from '@/schemas/protocols/stream/sockopt';
import { HysteriaStreamSettingsSchema } from '@/schemas/protocols/stream/hysteria';
import { TlsStreamSettingsSchema } from '@/schemas/protocols/security/tls';
import { SniffingSchema } from '@/schemas/primitives/sniffing';
import { TcpStreamSettingsSchema } from '@/schemas/protocols/stream/tcp';
import { KcpStreamSettingsSchema } from '@/schemas/protocols/stream/kcp';
import { WsStreamSettingsSchema } from '@/schemas/protocols/stream/ws';
import { GrpcStreamSettingsSchema } from '@/schemas/protocols/stream/grpc';
import { HttpUpgradeStreamSettingsSchema } from '@/schemas/protocols/stream/httpupgrade';
import { XHttpStreamSettingsSchema } from '@/schemas/protocols/stream/xhttp';
import { DateTimePicker } from '@/components/form';
import FinalMaskFormRhf from '@/lib/xray/forms/transport/FinalMaskFormRhf';
import { Button, Input, Label, Modal, Select, Tabs, Tooltip } from '@/components/ui';
import {
    FormProvider,
    useForm,
    Controller,
    RHFText,
    RHFNumber,
    RHFSelect,
    RHFSwitch,
    RHFField,
    Field,
    zodRule
} from '@/components/form/rhf';

import { AdvancedAllEditor, AdvancedSliceEditor } from './advanced-editors';
import { formatInboundIssue, formatInboundValidation } from './formatValidationError';
import {
    HttpFields,
    HysteriaFields,
    MixedFields,
    MtprotoFields,
    ShadowsocksFields,
    TunFields,
    TunnelFields,
    VlessFields,
    WireguardFields
} from './protocols';
import { ExternalProxyForm, GrpcForm, HttpUpgradeForm, KcpForm, RawForm, SockoptForm, WsForm, XhttpForm } from './transport';
import { RealityForm, TlsForm } from './security';
import { useSecurityActions } from './useSecurityActions';
import { useInboundFallbacks } from './useInboundFallbacks';
import FallbacksCard from './FallbacksCard';
import SniffingTab from './SniffingTab';

import type { DBInbound } from '@/models/dbinbound';
import type { NodeRecord } from '@/api/queries/useNodesQuery';

const PROTOCOL_OPTIONS = Object.values(Protocols).map((p) => ({ value: p, label: p }));
const TRAFFIC_RESETS = ['never', 'hourly', 'daily', 'weekly', 'monthly'] as const;
const NODE_ELIGIBLE_PROTOCOLS = new Set<string>([
    Protocols.VLESS,
    Protocols.VMESS,
    Protocols.TROJAN,
    Protocols.SHADOWSOCKS,
    Protocols.HYSTERIA,
    Protocols.WIREGUARD
]);

interface InboundFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  mode: 'add' | 'edit';
  dbInbound: DBInbound | null;
  dbInbounds: DBInbound[];
  availableNodes?: NodeRecord[];
}

function buildAddModeValues(): InboundFormValues
{
    const settings = createDefaultInboundSettings('vless') ?? undefined;
    return rawInboundToFormValues({
        protocol: 'vless',
        settings,
        streamSettings: {
            network: 'tcp',
            security: 'none',
            tcpSettings: TcpStreamSettingsSchema.parse({ header: { type: 'none' } })
        },
        sniffing: SniffingSchema.parse({}),
        port: RandomUtil.randomInteger(10000, 60000),
        listen: '',
        tag: '',
        enable: true,
        trafficReset: 'never'
    });
}

function newStreamSlice(n: string): Record<string, unknown>
{
    switch (n)
    {
        case 'tcp': return TcpStreamSettingsSchema.parse({ header: { type: 'none' } });
        case 'kcp': return KcpStreamSettingsSchema.parse({});
        case 'ws': return WsStreamSettingsSchema.parse({});
        case 'grpc': return GrpcStreamSettingsSchema.parse({});
        case 'httpupgrade': return HttpUpgradeStreamSettingsSchema.parse({});
        case 'xhttp': return XHttpStreamSettingsSchema.parse({});
        default: return {};
    }
}

export default function InboundFormModal({
    open,
    onClose,
    onSaved,
    mode,
    dbInbound,
    dbInbounds,
    availableNodes
}: InboundFormModalProps)
{
    const { t } = useTranslation();
    const [messageApi] = message.useMessage();
    const methods = useForm<InboundFormValues>({ defaultValues: buildAddModeValues() });
    const { watch, getValues, setValue, reset, trigger, control } = methods;
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('basic');
    const [advTab, setAdvTab] = useState('all');

    // streamSettings is a strict discriminated union; cascades build loose objects.
    const setStream = (v: unknown) => setValue('streamSettings', v as InboundFormValues['streamSettings']);
    const setRawValue = setValue as unknown as (name: string, value: unknown) => void;
    const getRawValue = getValues as unknown as (name: string) => unknown;

    const {
        fallbacks,
        fallbackChildOptions,
        loadFallbacks,
        saveFallbacks,
        addFallback,
        updateFallback,
        removeFallback,
        moveFallback,
        addAllFallbacks
    } = useInboundFallbacks(dbInbound, dbInbounds);

    const selectableNodes = (availableNodes || []).filter((n) => n.enable);
    const protocol = (watch('protocol') ?? '') as string;
    const isNodeEligible = NODE_ELIGIBLE_PROTOCOLS.has(protocol);
    const sniffingEnabled = (watch('sniffing.enabled') ?? false) as boolean;
    const ssMethod = watch('settings.method');
    const isSSWith2022 = isSS2022({ protocol, settings: typeof ssMethod === 'string' ? { method: ssMethod } : {} });
    const mixedUdpOn = (watch('settings.udp') ?? false) as boolean;
    const network = (watch('streamSettings.network') ?? '') as string;
    const security = (watch('streamSettings.security') ?? 'none') as string;
    const streamEnabled = canEnableStream({ protocol });

    const wPort = watch('port');
    const wListen = (watch('listen') ?? '') as string;
    const isUdsListen = wListen.startsWith('/') || wListen.startsWith('@');
    const wNodeId = (watch('nodeId') ?? null) as number | null;
    const wTag = (watch('tag') ?? '') as string;
    const wSsNetwork = watch('settings.network');
    const wTunnelNetwork = watch('settings.allowedNetwork');
    const vlessEncryption = (watch('settings.encryption') ?? '') as string;
    const autoTagRef = useRef(true);
    const lastWrittenTagRef = useRef('');
    const currentTagInput = (): InboundTagInput => ({
        port: typeof wPort === 'number' ? wPort : 0,
        nodeId: typeof wNodeId === 'number' ? wNodeId : null,
        protocol,
        streamSettings: { network },
        settings: { network: wSsNetwork, allowedNetwork: wTunnelNetwork, udp: mixedUdpOn }
    });
    const isFallbackHost =
    (protocol === Protocols.VLESS || protocol === Protocols.TROJAN)
    && network === 'tcp'
    && (security === 'tls' || security === 'reality');

    const {
        genRealityKeypair,
        clearRealityKeypair,
        genMldsa65,
        clearMldsa65,
        randomizeRealityTarget,
        randomizeShortIds,
        getNewEchCert,
        clearEchCert,
        generateRandomPinHash,
        setCertFromPanel,
        clearCertFiles,
        onSecurityChange
    } = useSecurityActions({
        setValue: setRawValue,
        getValues: getRawValue,
        setSaving,
        messageApi,
        nodeId: typeof wNodeId === 'number' ? wNodeId : null
    });

    const toggleExternalProxy = (on: boolean) =>
    {
        if (on)
        {
            const port = (getValues('port') as number) ?? 443;
            setRawValue('streamSettings.externalProxy', [{
                forceTls: 'same',
                dest: typeof window !== 'undefined' ? window.location.hostname : '',
                port,
                remark: '',
                sni: '',
                fingerprint: '',
                alpn: [],
                pinnedPeerCertSha256: []
            }]);
        }
        else
        {
            setRawValue('streamSettings.externalProxy', []);
        }
    };

    const toggleSockopt = (on: boolean) =>
    {
        setRawValue('streamSettings.sockopt', on ? SockoptStreamSettingsSchema.parse({}) : undefined);
    };

    const wgSecretKey = watch('settings.secretKey');
    const wgPubKey = typeof wgSecretKey === 'string' && wgSecretKey.length > 0
        ? Wireguard.generateKeypair(wgSecretKey).publicKey
        : '';

    const regenInboundWg = () =>
    {
        const kp = Wireguard.generateKeypair();
        setRawValue('settings.secretKey', kp.privateKey);
    };
    const regenWgPeerKeypair = (peerName: number) =>
    {
        const kp = Wireguard.generateKeypair();
        setRawValue(`settings.peers.${ peerName }.privateKey`, kp.privateKey);
        setRawValue(`settings.peers.${ peerName }.publicKey`, kp.publicKey);
    };

    const matchesVlessAuth = (block: { id?: string; label?: string } | undefined | null, authId: string) =>
    {
        if (block?.id === authId)
        {
            return true;
        }
        const label = (block?.label || '').toLowerCase().replace(/[-_\s]/g, '');
        if (authId === 'mlkem768')
        {
            return label.includes('mlkem768');
        }
        if (authId === 'x25519')
        {
            return label.includes('x25519');
        }
        return false;
    };

    const getNewVlessEnc = async (authId: string) =>
    {
        if (!authId)
        {
            return;
        }
        setSaving(true);
        try
        {
            const msg = await HttpUtil.get('/panel/api/server/getNewVlessEnc');
            if (!msg?.success)
            {
                return;
            }
            const obj = msg.obj as { auths?: { decryption: string; encryption: string; label?: string; id?: string }[] };
            const block = (obj.auths || []).find((a) => matchesVlessAuth(a, authId));
            if (!block)
            {
                return;
            }
            setRawValue('settings.decryption', block.decryption);
            setRawValue('settings.encryption', block.encryption);
        }
        finally
        {
            setSaving(false);
        }
    };

    const clearVlessEnc = () =>
    {
        setRawValue('settings.decryption', 'none');
        setRawValue('settings.encryption', 'none');
    };

    const selectedVlessAuth = (() =>
    {
        const enc = typeof vlessEncryption === 'string' ? vlessEncryption : '';
        if (!enc || enc === 'none')
        {
            return 'None';
        }
        const parts = enc.split('.').filter(Boolean);
        const authKey = parts[parts.length - 1] || '';
        if (!authKey)
        {
            return t('pages.inbounds.vlessAuthCustom');
        }
        return authKey.length > 300 ? t('pages.inbounds.vlessAuthMlkem768') : t('pages.inbounds.vlessAuthX25519');
    })();

    useEffect(() =>
    {
        if (!open)
        {
            return;
        }
        const initial = mode === 'edit' && dbInbound ? rawInboundToFormValues(dbInbound) : buildAddModeValues();
        reset(initial as InboundFormValues);
        setActiveTab('basic');
        const initialTag = (initial.tag ?? '') as string;
        autoTagRef.current = isAutoInboundTag(initialTag, {
            port: initial.port ?? 0,
            nodeId: initial.nodeId ?? null,
            protocol: initial.protocol,
            streamSettings: (initial.streamSettings ?? {}) as Record<string, unknown>,
            settings: (initial.settings ?? {}) as Record<string, unknown>
        });
        lastWrittenTagRef.current = initialTag;
        if (mode === 'edit' && dbInbound && (dbInbound.protocol === Protocols.VLESS || dbInbound.protocol === Protocols.TROJAN))
        {
            loadFallbacks(dbInbound.id);
        }
        else
        {
            loadFallbacks(null);
        }
    }, [open, mode, dbInbound]);

    useEffect(() =>
    {
        if (!open)
        {
            return;
        }
        if (wTag === lastWrittenTagRef.current)
        {
            return;
        }
        autoTagRef.current = isAutoInboundTag(wTag, currentTagInput());
    }, [open, wTag]);

    useEffect(() =>
    {
        if (!open || !autoTagRef.current)
        {
            return;
        }
        const next = composeInboundTag(currentTagInput());
        if (next !== ((getValues('tag') as string) ?? ''))
        {
            lastWrittenTagRef.current = next;
            setRawValue('tag', next);
        }
    }, [open, wPort, wNodeId, protocol, network, mixedUdpOn, wSsNetwork, wTunnelNetwork]);

    function applyProtocol(next: string)
    {
        const settings = createDefaultInboundSettings(next) ?? undefined;
        setRawValue('settings', settings);
        if (!NODE_ELIGIBLE_PROTOCOLS.has(next))
        {
            setRawValue('nodeId', null);
        }
        if (next === Protocols.HYSTERIA)
        {
            const tls = TlsStreamSettingsSchema.parse({}) as Record<string, unknown>;
            tls.certificates = [{
                useFile: true,
                certificateFile: '',
                keyFile: '',
                certificate: [],
                key: [],
                oneTimeLoading: false,
                usage: 'encipherment',
                buildChain: false
            }];
            setStream({
                network: 'hysteria',
                security: 'tls',
                hysteriaSettings: HysteriaStreamSettingsSchema.parse({}),
                tlsSettings: tls,
                finalmask: { tcp: [], udp: [{ type: 'salamander', settings: { password: RandomUtil.randomLowerAndNum(16) } }] }
            });
        }
        else
        {
            const current = getValues('streamSettings') as { network?: string } | undefined;
            if (current?.network === 'hysteria')
            {
                setStream({ network: 'tcp', security: 'none', tcpSettings: {} });
            }
        }
    }

    function onNetworkChange(next: string)
    {
        const ALL = ['tcpSettings', 'kcpSettings', 'wsSettings', 'grpcSettings', 'httpupgradeSettings', 'xhttpSettings'];
        const current = (getValues('streamSettings') as Record<string, unknown>) ?? {};
        const cleaned: Record<string, unknown> = { ...current, network: next };
        for (const k of ALL)
        {
            if (k !== `${ next }Settings`)
            {
                delete cleaned[k];
            }
        }
        cleaned[`${ next }Settings`] = newStreamSlice(next);
        if (next === 'kcp')
        {
            const fm = (cleaned.finalmask as Record<string, unknown> | undefined) ?? {};
            const udp = Array.isArray(fm.udp) ? (fm.udp as unknown[]) : [];
            const hasMkcp = udp.some((m) => (m as { type?: string })?.type === 'mkcp-legacy');
            if (!hasMkcp)
            {
                cleaned.finalmask = { ...fm, udp: [...udp, { type: 'mkcp-legacy', settings: { header: '', value: '' } }] };
            }
        }
        setStream(cleaned);
    }

    const submit = async () =>
    {
        if (!(await trigger()))
        {
            return;
        }
        const values = getValues();
        const parsed = InboundFormSchema.safeParse(values);
        if (!parsed.success)
        {
            const issues = parsed.error.issues;
            messageApi.error(formatInboundValidation(issues, values, t));

            console.error('[InboundFormModal] schema validation failed:', issues.map((issue) => formatInboundIssue(issue, values, t)));
            return;
        }
        setSaving(true);
        try
        {
            const payload = formValuesToWirePayload(parsed.data);
            const url = mode === 'edit' && dbInbound ? `/panel/api/inbounds/update/${ dbInbound.id }` : '/panel/api/inbounds/add';
            const msg = await HttpUtil.post(url, payload);
            if (msg?.success)
            {
                if (isFallbackHost)
                {
                    const obj = msg.obj as { id?: number; Id?: number } | null;
                    const masterId = mode === 'edit' ? dbInbound!.id : (obj?.id ?? obj?.Id ?? 0);
                    if (masterId)
                    {
                        await saveFallbacks(masterId);
                    }
                }
                onSaved();
                onClose();
            }
        }
        finally
        {
            setSaving(false);
        }
    };

    const title = mode === 'edit' ? t('pages.inbounds.modifyInbound') : t('pages.inbounds.addInbound');
    const okText = mode === 'edit' ? t('pages.clients.submitEdit') : t('create');

    const totalBytes = (watch('total') as number) ?? 0;
    const totalGB = totalBytes ? Math.round((totalBytes / SizeFormatter.ONE_GB) * 100) / 100 : 0;

    const basicTab = (
    <div className="flex flex-col gap-4">
      <RHFSwitch name="enable" label={t('enable')} />
      <RHFText name="remark" label={t('pages.inbounds.remark')} />
      {selectableNodes.length > 0 && isNodeEligible && (
        <RHFField
          name="nodeId"
          label={t('pages.inbounds.deployTo')}
          render={({ value, onChange }) => (
            <Select
              disabled={mode === 'edit'}
              value={value == null ? '' : String(value)}
              onChange={(v) => onChange(v === '' ? null : Number(v))}
              placeholder={t('pages.inbounds.localPanel')}
              options={[
                  { value: '', label: t('pages.inbounds.localPanel') },
                  ...selectableNodes.map((n) => ({
                      value: String(n.id),
                      label: `${ n.name }${ n.status === 'offline' ? ' (offline)' : '' }`,
                      disabled: n.status === 'offline'
                  }))
              ]}
            />
          )}
        />
      )}
      <RHFField
        name="protocol"
        label={t('pages.inbounds.protocol')}
        render={({ value, onChange }) => (
          <Select
            disabled={mode === 'edit'}
            value={(value as string) ?? 'vless'}
            onChange={(v) =>
            {
                onChange(v);
                if (mode !== 'edit')
                {
                    applyProtocol(v);
                }
            }}
            options={PROTOCOL_OPTIONS}
          />
        )}
      />
      <RHFText name="listen" label={t('pages.inbounds.address')} hint={t('pages.inbounds.form.listenHelp')} placeholder={t('pages.inbounds.monitorDesc')} />
      <RHFNumber name="port" label={t('pages.inbounds.port')} min={isUdsListen ? 0 : 1} max={65535} rules={zodRule(InboundFormBaseSchema.shape.port, t)} />
      <Field label={<Tooltip content={t('pages.inbounds.meansNoLimit')}><span className="cursor-help underline decoration-dotted decoration-muted-foreground/40">{t('pages.inbounds.totalFlow')}</span></Tooltip>}>
        <Input
          type="number"
          min={0}
          step={1}
          value={totalGB}
          onChange={(e) => setRawValue('total', NumberFormatter.toFixed((Number(e.target.value) || 0) * SizeFormatter.ONE_GB, 0))}
        />
      </Field>
      <RHFSelect
        name="trafficReset"
        label={t('pages.inbounds.periodicTrafficResetTitle')}
        options={TRAFFIC_RESETS.map((r) => ({ value: r, label: t(`pages.inbounds.periodicTrafficReset.${ r }`) }))}
      />
      <Field label={<Tooltip content={t('pages.inbounds.leaveBlankToNeverExpire')}><span className="cursor-help underline decoration-dotted decoration-muted-foreground/40">{t('pages.inbounds.expireDate')}</span></Tooltip>}>
        <Controller
          control={control}
          name="expiryTime"
          render={({ field }) => (
            <DateTimePicker
              value={typeof field.value === 'number' && field.value > 0 ? dayjs(field.value) : null}
              onChange={(d) => field.onChange(d ? d.valueOf() : 0)}
            />
          )}
        />
      </Field>
    </div>
    );

    const protocolTab = (
    <div className="flex flex-col gap-4">
      {protocol === Protocols.WIREGUARD && (
        <WireguardFields wgPubKey={wgPubKey} regenInboundWg={regenInboundWg} regenWgPeerKeypair={regenWgPeerKeypair} />
      )}
      {protocol === Protocols.TUN && <TunFields />}
      {protocol === Protocols.TUNNEL && <TunnelFields />}
      {protocol === Protocols.HTTP && <HttpFields />}
      {protocol === Protocols.MIXED && <MixedFields mixedUdpOn={mixedUdpOn} />}
      {protocol === Protocols.MTPROTO && <MtprotoFields />}
      {protocol === Protocols.SHADOWSOCKS && <ShadowsocksFields isSSWith2022={isSSWith2022} />}
      {protocol === Protocols.VLESS && (
        <VlessFields
          saving={saving}
          selectedVlessAuth={selectedVlessAuth}
          network={network}
          security={security}
          getNewVlessEnc={getNewVlessEnc}
          clearVlessEnc={clearVlessEnc}
        />
      )}
      {isFallbackHost && (
        <FallbacksCard
          fallbacks={fallbacks}
          fallbackChildOptions={fallbackChildOptions}
          addFallback={addFallback}
          updateFallback={updateFallback}
          removeFallback={removeFallback}
          moveFallback={moveFallback}
          addAllFallbacks={addAllFallbacks}
        />
      )}
    </div>
    );

    const streamTab = (
    <div className="flex flex-col gap-4">
      {protocol !== Protocols.HYSTERIA && (
        <RHFField
          name="streamSettings.network"
          label={t('transmission')}
          render={({ value }) => (
            <Select
              value={(value as string) ?? 'tcp'}
              onChange={onNetworkChange}
              options={[
                  { value: 'tcp', label: 'RAW' },
                  { value: 'kcp', label: 'mKCP' },
                  { value: 'ws', label: 'WebSocket' },
                  { value: 'grpc', label: 'gRPC' },
                  { value: 'httpupgrade', label: 'HTTPUpgrade' },
                  { value: 'xhttp', label: 'XHTTP' }
              ]}
            />
          )}
        />
      )}
      {protocol === Protocols.HYSTERIA && <HysteriaFields />}
      {network === 'tcp' && <RawForm />}
      {network === 'ws' && <WsForm />}
      {network === 'grpc' && <GrpcForm />}
      {network === 'xhttp' && <XhttpForm />}
      {network === 'httpupgrade' && <HttpUpgradeForm />}
      {network === 'kcp' && <KcpForm />}
      <ExternalProxyForm toggleExternalProxy={toggleExternalProxy} />
      <SockoptForm toggleSockopt={toggleSockopt} network={network} />
      <FinalMaskFormRhf name="streamSettings.finalmask" network={network} protocol={protocol} />
    </div>
    );

    const tlsOk = canEnableTls({ protocol, streamSettings: { network, security } });
    const realityOk = canEnableReality({ protocol, streamSettings: { network, security } });
    const securityTabs = [
        ...(protocol !== Protocols.HYSTERIA ? [{ key: 'none', label: t('none') }] : []),
        { key: 'tls', label: 'TLS' },
        ...(realityOk ? [{ key: 'reality', label: 'Reality' }] : [])
    ];

    const securityTab = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label>{t('pages.inbounds.securityTab')}</Label>
        <Tabs variant="segmented" tabs={securityTabs} value={security} onChange={(k) => onSecurityChange(k)} />
      </div>
      {security === 'tls' && tlsOk && (
        <TlsForm
          saving={saving}
          setCertFromPanel={setCertFromPanel}
          clearCertFiles={clearCertFiles}
          generateRandomPinHash={generateRandomPinHash}
          getNewEchCert={getNewEchCert}
          clearEchCert={clearEchCert}
        />
      )}
      {security === 'reality' && realityOk && (
        <RealityForm
          saving={saving}
          randomizeRealityTarget={randomizeRealityTarget}
          randomizeShortIds={randomizeShortIds}
          genRealityKeypair={genRealityKeypair}
          clearRealityKeypair={clearRealityKeypair}
          genMldsa65={genMldsa65}
          clearMldsa65={clearMldsa65}
        />
      )}
    </div>
    );

    const advancedTab = (
    <div className="flex flex-col gap-3">
      <div>
        <div className="text-sm font-semibold text-foreground">{t('pages.inbounds.advanced.title')}</div>
        <div className="text-xs text-muted-foreground">{t('pages.inbounds.advanced.subtitle')}</div>
      </div>
      <Tabs
        value={advTab}
        onChange={setAdvTab}
        tabs={[
            { key: 'all', label: t('pages.inbounds.advanced.all') },
            { key: 'settings', label: t('pages.inbounds.advanced.settings') },
            ...(streamEnabled ? [{ key: 'stream', label: t('pages.inbounds.advanced.stream') }] : []),
            { key: 'sniffing', label: t('pages.inbounds.advanced.sniffing') }
        ]}
      />
      <div className="pt-2">
        {advTab === 'all' && (
          <>
            <div className="mb-2 text-xs text-muted-foreground">{t('pages.inbounds.advanced.allHelp')}</div>
            <AdvancedAllEditor streamEnabled={streamEnabled} />
          </>
        )}
        {advTab === 'settings' && (
          <>
            <div className="mb-2 text-xs text-muted-foreground">{t('pages.inbounds.advanced.settingsHelp')}</div>
            <AdvancedSliceEditor path="settings" wrapKey="settings" minHeight="320px" maxHeight="540px" />
          </>
        )}
        {advTab === 'stream' && streamEnabled && (
          <>
            <div className="mb-2 text-xs text-muted-foreground">{t('pages.inbounds.advanced.streamHelp')}</div>
            <AdvancedSliceEditor path="streamSettings" wrapKey="streamSettings" minHeight="320px" maxHeight="540px" />
          </>
        )}
        {advTab === 'sniffing' && (
          <>
            <div className="mb-2 text-xs text-muted-foreground">{t('pages.inbounds.advanced.sniffingHelp')}</div>
            <AdvancedSliceEditor path="sniffing" wrapKey="sniffing" minHeight="240px" maxHeight="420px" />
          </>
        )}
      </div>
    </div>
    );

    const showProtocolTab =
    ([Protocols.VLESS, Protocols.SHADOWSOCKS, Protocols.HTTP, Protocols.MIXED, Protocols.TUNNEL, Protocols.TUN, Protocols.WIREGUARD, Protocols.MTPROTO] as string[]).includes(protocol)
    || isFallbackHost;

    const tabList = useMemo(
        () => [
            { key: 'basic', label: t('pages.xray.basicTemplate') },
            ...(showProtocolTab ? [{ key: 'protocol', label: t('pages.inbounds.protocol') }] : []),
            ...(streamEnabled ? [{ key: 'stream', label: t('pages.inbounds.streamTab') }, { key: 'security', label: t('pages.inbounds.securityTab') }] : []),
            { key: 'sniffing', label: t('pages.inbounds.sniffingTab') },
            { key: 'advanced', label: t('pages.xray.advancedTemplate') }
        ],
        [t, showProtocolTab, streamEnabled]
    );
    const validKeys = tabList.map((x) => x.key);
    const curTab = validKeys.includes(activeTab) ? activeTab : 'basic';

    const tabContent: Record<string, React.ReactNode> = {
        basic: basicTab,
        protocol: protocolTab,
        stream: streamTab,
        security: securityTab,
        sniffing: <SniffingTab sniffingEnabled={sniffingEnabled} />,
        advanced: advancedTab
    };

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
              <Button loading={saving} onClick={submit}>
                {okText}
              </Button>
            </>
          }
        >
          <Tabs value={curTab} onChange={setActiveTab} tabs={tabList} />
          <div className="pt-4">{tabContent[curTab]}</div>
        </Modal>
      </FormProvider>
    </>
    );
}
