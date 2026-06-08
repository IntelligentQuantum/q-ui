import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { MessageApi } from '@/components/ui/message';

import { HttpUtil, RandomUtil } from '@/utils';
import { getRandomRealityTarget } from '@/models/reality-targets';
import { TlsStreamSettingsSchema } from '@/schemas/protocols/security/tls';
import { RealityStreamSettingsSchema } from '@/schemas/protocols/security/reality';

interface UseSecurityActionsArgs {
  // react-hook-form setValue/getValues (loosely typed by dot-path so the deep
  // streamSettings union paths don't fight RHF's Path<> inference).
  setValue: (name: string, value: unknown) => void;
  getValues: (name: string) => unknown;
  setSaving: Dispatch<SetStateAction<boolean>>;
  messageApi: MessageApi;
  // Node the inbound is deployed to (null = central panel). "Set Cert from
  // Panel" must read the node's own cert paths for a node-assigned inbound.
  nodeId: number | null;
}

const R = 'streamSettings.realitySettings';
const T = 'streamSettings.tlsSettings';

// Server-side TLS / Reality key + certificate generation handlers for the
// inbound modal's security tab. Each talks to a /panel server endpoint and
// writes the result back into the form.
export function useSecurityActions({ setValue, getValues, setSaving, messageApi, nodeId }: UseSecurityActionsArgs)
{
    const { t } = useTranslation();

    const genRealityKeypair = async () =>
    {
        setSaving(true);
        try
        {
            const msg = await HttpUtil.get('/panel/api/server/getNewX25519Cert');
            if (msg?.success)
            {
                const obj = msg.obj as { privateKey: string; publicKey: string };
                setValue(`${ R }.privateKey`, obj.privateKey);
                setValue(`${ R }.settings.publicKey`, obj.publicKey);
            }
        }
        finally
        {
            setSaving(false);
        }
    };

    const clearRealityKeypair = () =>
    {
        setValue(`${ R }.privateKey`, '');
        setValue(`${ R }.settings.publicKey`, '');
    };

    const genMldsa65 = async () =>
    {
        setSaving(true);
        try
        {
            const msg = await HttpUtil.get('/panel/api/server/getNewmldsa65');
            if (msg?.success)
            {
                const obj = msg.obj as { seed: string; verify: string };
                setValue(`${ R }.mldsa65Seed`, obj.seed);
                setValue(`${ R }.settings.mldsa65Verify`, obj.verify);
            }
        }
        finally
        {
            setSaving(false);
        }
    };

    const clearMldsa65 = () =>
    {
        setValue(`${ R }.mldsa65Seed`, '');
        setValue(`${ R }.settings.mldsa65Verify`, '');
    };

    const randomizeRealityTarget = () =>
    {
        const tgt = getRandomRealityTarget() as { target: string; sni: string };
        setValue(`${ R }.target`, tgt.target);
        setValue(`${ R }.serverNames`, tgt.sni.split(',').map((s) => s.trim()).filter(Boolean));
    };

    const randomizeShortIds = () =>
    {
        setValue(`${ R }.shortIds`, RandomUtil.randomShortIds().split(',').map((s) => s.trim()).filter(Boolean));
    };

    const getNewEchCert = async () =>
    {
        const sni = getValues(`${ T }.serverName`);
        setSaving(true);
        try
        {
            const msg = await HttpUtil.post('/panel/api/server/getNewEchCert', { sni });
            if (msg?.success)
            {
                const obj = msg.obj as { echServerKeys: string; echConfigList: string };
                setValue(`${ T }.echServerKeys`, obj.echServerKeys);
                setValue(`${ T }.settings.echConfigList`, obj.echConfigList);
            }
        }
        finally
        {
            setSaving(false);
        }
    };

    const clearEchCert = () =>
    {
        setValue(`${ T }.echServerKeys`, '');
        setValue(`${ T }.settings.echConfigList`, '');
    };

    const generateRandomPinHash = () =>
    {
        const bytes = new Uint8Array(32);
        crypto.getRandomValues(bytes);
        const hash = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
        const current = (getValues(`${ T }.settings.pinnedPeerCertSha256`) as string[] | undefined) ?? [];
        setValue(`${ T }.settings.pinnedPeerCertSha256`, [...current, hash]);
    };

    const setCertFromPanel = async (certName: number) =>
    {
        setSaving(true);
        try
        {
            const msg = typeof nodeId === 'number'
                ? await HttpUtil.get(`/panel/api/nodes/webCert/${ nodeId }`, undefined, { silent: true })
                : await HttpUtil.post('/panel/setting/all', undefined, { silent: true });
            if (!msg?.success)
            {
                messageApi.warning(msg?.msg || t('pages.inbounds.setDefaultCertEmpty'));
                return;
            }
            const obj = msg.obj as { webCertFile?: string; webKeyFile?: string };
            if (!obj?.webCertFile && !obj?.webKeyFile)
            {
                messageApi.warning(t('pages.inbounds.setDefaultCertEmpty'));
                return;
            }
            setValue(`${ T }.certificates.${ certName }.certificateFile`, obj.webCertFile ?? '');
            setValue(`${ T }.certificates.${ certName }.keyFile`, obj.webKeyFile ?? '');
        }
        finally
        {
            setSaving(false);
        }
    };

    const clearCertFiles = (certName: number) =>
    {
        setValue(`${ T }.certificates.${ certName }.certificateFile`, '');
        setValue(`${ T }.certificates.${ certName }.keyFile`, '');
    };

    const onSecurityChange = async (next: string) =>
    {
        const current = (getValues('streamSettings') as Record<string, unknown>) ?? {};
        const cleaned: Record<string, unknown> = { ...current, security: next };
        delete cleaned.tlsSettings;
        delete cleaned.realitySettings;
        if (next === 'tls')
        {
            const tls = TlsStreamSettingsSchema.parse({}) as Record<string, unknown>;
            tls.certificates = [{
                useFile: true,
                certificateFile: '',
                keyFile: '',
                certificate: [],
                key: [],
                ocspStapling: 3600,
                oneTimeLoading: false,
                usage: 'encipherment',
                buildChain: false
            }];
            cleaned.tlsSettings = tls;
        }
        if (next === 'reality')
        {
            const reality = RealityStreamSettingsSchema.parse({}) as Record<string, unknown>;
            const tgt = getRandomRealityTarget() as { target: string; sni: string };
            reality.target = tgt.target;
            reality.serverNames = tgt.sni.split(',').map((s) => s.trim()).filter(Boolean);
            reality.shortIds = RandomUtil.randomShortIds().split(',').map((s) => s.trim()).filter(Boolean);
            cleaned.realitySettings = reality;
        }
        setValue('streamSettings', cleaned);
        if (next === 'reality')
        {
            try
            {
                const msg = await HttpUtil.get('/panel/api/server/getNewX25519Cert');
                if (msg?.success)
                {
                    const obj = msg.obj as { privateKey: string; publicKey: string };
                    setValue(`${ R }.privateKey`, obj.privateKey);
                    setValue(`${ R }.settings.publicKey`, obj.publicKey);
                }
            }
            catch
            {
                // best-effort: leave keypair fields empty if server call fails
            }
        }
    };

    return {
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
    };
}
