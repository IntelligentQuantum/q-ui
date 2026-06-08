import { Plus, Trash2, RefreshCw } from 'lucide-react';

import { RandomUtil } from '@/utils';
import { OutboundProtocols } from '@/schemas/primitives';
import { Button, Input, Label, Select, Switch } from '@/components/ui';
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

// RHF port of FinalMaskForm. `name` is a DOT-PATH base (e.g. "streamSettings.finalmask").
// The original AntD version lives alongside (still used by the inbound modal).
export interface FinalMaskFormProps {
  name: string;
  network: string;
  protocol: string;
  showAll?: boolean;
}

const TCP_NETWORKS = ['raw', 'tcp', 'httpupgrade', 'ws', 'grpc', 'xhttp'];

function defaultTcpMaskSettings(type: string): Record<string, unknown>
{
    switch (type)
    {
        case 'fragment':
            return { packets: '1-3', length: '100-200', delay: '', maxSplit: '' };
        case 'sudoku':
            return { password: '', ascii: '', customTable: '', customTables: [''], paddingMin: 0, paddingMax: 0 };
        case 'header-custom':
            return { clients: [], servers: [] };
        default:
            return {};
    }
}

function defaultUdpMaskSettings(type: string): Record<string, unknown>
{
    switch (type)
    {
        case 'salamander':
            return { password: '' };
        case 'mkcp-legacy':
            return { header: '', value: '' };
        case 'xdns':
            return { domains: [] };
        case 'xicmp':
            return { dgram: false, ips: [] };
        case 'realm':
            return { url: '', stunServers: [] };
        case 'header-custom':
            return { client: [], server: [] };
        case 'noise':
            return { reset: 0, noise: [] };
        default:
            return {};
    }
}

const defaultClientServerItem = () => ({ delay: 0, rand: 0, randRange: '0-255', type: 'array', packet: [] });
const defaultUdpClientServerItem = () => ({ rand: 0, randRange: '0-255', type: 'array', packet: [] });
const defaultNoiseItem = () => ({ rand: '1-8192', randRange: '0-255', type: 'array', packet: [], delay: '10-20' });
const defaultUdpHop = () => ({ ports: '20000-50000', interval: '5-10' });
function defaultQuicParams(): Record<string, unknown>
{
    return {
        congestion: 'bbr',
        debug: false,
        maxIdleTimeout: 30,
        keepAlivePeriod: 10,
        disablePathMTUDiscovery: false,
        maxIncomingStreams: 1024,
        initStreamReceiveWindow: 8388608,
        maxStreamReceiveWindow: 8388608,
        initConnectionReceiveWindow: 20971520,
        maxConnectionReceiveWindow: 20971520
    };
}

function validateFragmentLength(value: unknown): true | string
{
    const str = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
    if (str.length === 0)
    {
        return 'Length is required — xray rejects a fragment mask whose LengthMin is 0';
    }
    const min = Number(str.split('-')[0]);
    if (!Number.isFinite(min) || min <= 0)
    {
        return 'Length minimum must be greater than 0 (e.g. 100-200)';
    }
    return true;
}

// A header row for a removable list entry (replaces AntD <Divider> with delete).
function ItemHeader({ title, onRemove }: { title: string; onRemove: () => void })
{
    return (
    <div className="-mt-1 flex items-center justify-between border-t border-border pt-3">
      <span className="text-sm font-medium text-foreground">{title}</span>
      <button
        type="button"
        aria-label="Delete"
        onClick={onRemove}
        className="text-muted-foreground transition-colors hover:text-danger"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
    );
}

function AddRow({ label, onAdd }: { label: string; onAdd: () => void })
{
    return (
    <div className="flex items-center justify-between">
      <Label>{label}</Label>
      <Button size="sm" variant="secondary" aria-label="Add" onClick={onAdd}>
        <Plus className="h-4 w-4" />
      </Button>
    </div>
    );
}

// Input + regenerate-button row (replaces AntD Space.Compact + ReloadOutlined).
function RegenInput({
    name,
    label,
    placeholder,
    onRegen
}: {
  name: string;
  label: string;
  placeholder?: string;
  onRegen: () => void;
})
{
    const { register } = useFormContext();
    return (
    <Field name={name} label={label}>
      <div className="flex gap-2">
        <Input className="flex-1" placeholder={placeholder} {...register(name)} />
        <Button variant="secondary" size="icon" aria-label="Regenerate" onClick={onRegen}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
    </Field>
    );
}

export default function FinalMaskFormRhf({ name, network, protocol, showAll = false }: FinalMaskFormProps)
{
    const base = name;
    const { setValue } = useFormContext();
    const isHysteria = protocol === OutboundProtocols.Hysteria || protocol === 'hysteria';
    const showTcp = showAll || TCP_NETWORKS.includes(network);
    const showUdp = showAll || isHysteria || network === 'kcp';
    const showQuic = showAll || isHysteria || network === 'xhttp';
    const hasQuicParams = useWatch({ name: `${ base }.quicParams` }) != null;

    if (!showTcp && !showUdp && !showQuic)
    {
        return null;
    }

    return (
    <>
      {showTcp && <TcpMasksList base={base} />}
      {showUdp && <UdpMasksList base={base} isHysteria={isHysteria} network={network} />}
      {showQuic && (
        <>
          <div className="flex items-center justify-between gap-3">
            <Label>QUIC Params</Label>
            <Switch
              checked={hasQuicParams}
              aria-label="QUIC Params"
              onCheckedChange={(v) => setValue(`${ base }.quicParams`, v ? defaultQuicParams() : undefined)}
            />
          </div>
          {hasQuicParams && <QuicParamsForm base={`${ base }.quicParams`} />}
        </>
      )}
    </>
    );
}

function TcpMasksList({ base }: { base: string })
{
    const { control } = useFormContext();
    const fa = useFieldArray({ control, name: `${ base }.tcp` });
    return (
    <div className="flex flex-col gap-3">
      <AddRow label="TCP Masks" onAdd={() => fa.append({ type: 'fragment', settings: defaultTcpMaskSettings('fragment') })} />
      {fa.fields.map((field, i) => (
        <TcpMaskItem key={field.id} base={`${ base }.tcp.${ i }`} index={i + 1} onRemove={() => fa.remove(i)} />
      ))}
    </div>
    );
}

function TcpMaskItem({ base, index, onRemove }: { base: string; index: number; onRemove: () => void })
{
    const { setValue } = useFormContext();
    const type = useWatch({ name: `${ base }.type` }) as string | undefined;
    return (
    <div className="flex flex-col gap-3">
      <ItemHeader title={`TCP Mask ${ index }`} onRemove={onRemove} />
      <RHFField
        name={`${ base }.type`}
        label="Type"
        render={({ value, onChange }) => (
          <Select
            value={(value as string) ?? 'fragment'}
            onChange={(v) =>
            {
                onChange(v);
                setValue(`${ base }.settings`, defaultTcpMaskSettings(v));
            }}
            options={[
                { value: 'fragment', label: 'Fragment' },
                { value: 'header-custom', label: 'Header Custom' },
                { value: 'sudoku', label: 'Sudoku' }
            ]}
          />
        )}
      />
      {type === 'fragment' && (
        <>
          <RHFSelect
            name={`${ base }.settings.packets`}
            label="Packets"
            options={[
                { value: 'tlshello', label: 'tlshello' },
                { value: '1-3', label: '1-3' },
                { value: '1-5', label: '1-5' }
            ]}
          />
          <RHFText
            name={`${ base }.settings.length`}
            label="Length"
            placeholder="e.g. 100-200"
            rules={{ validate: validateFragmentLength }}
          />
          <RHFText name={`${ base }.settings.delay`} label="Delay" />
          <RHFText name={`${ base }.settings.maxSplit`} label="Max Split" />
        </>
      )}
      {type === 'sudoku' && (
        <>
          <RHFText name={`${ base }.settings.password`} label="Password" />
          <RHFText name={`${ base }.settings.ascii`} label="ASCII" />
          <RHFText name={`${ base }.settings.customTable`} label="Custom Table" />
          <RHFTags name={`${ base }.settings.customTables`} label="Custom Tables" />
          <RHFNumber name={`${ base }.settings.paddingMin`} label="Padding Min" min={0} />
          <RHFNumber name={`${ base }.settings.paddingMax`} label="Padding Max" min={0} />
        </>
      )}
      {type === 'header-custom' && <HeaderCustomGroups base={`${ base }.settings`} />}
    </div>
    );
}

// clients/servers: each is an array of GROUPS, each group an array of items.
function HeaderCustomGroups({ base }: { base: string })
{
    return (
    <>
      {(['clients', 'servers'] as const).map((groupKey) => (
        <GroupList key={groupKey} base={`${ base }.${ groupKey }`} label={groupKey === 'clients' ? 'Clients' : 'Servers'} />
      ))}
    </>
    );
}

function GroupList({ base, label }: { base: string; label: string })
{
    const { control } = useFormContext();
    const fa = useFieldArray({ control, name: base });
    return (
    <div className="flex flex-col gap-3">
      <AddRow label={label} onAdd={() => fa.append([defaultClientServerItem()])} />
      {fa.fields.map((field, gi) => (
        <div key={field.id} className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <ItemHeader title={`${ label } Group ${ gi + 1 }`} onRemove={() => fa.remove(gi)} />
          <ItemsList base={`${ base }.${ gi }`} delayMode="number" />
        </div>
      ))}
    </div>
    );
}

function ItemsList({ base, delayMode }: { base: string; delayMode: 'number' | 'string' })
{
    const { control } = useFormContext();
    const fa = useFieldArray({ control, name: base });
    return (
    <div className="flex flex-col gap-3">
      <AddRow label="Items" onAdd={() => fa.append(defaultClientServerItem())} />
      {fa.fields.map((field, i) => (
        <ItemEditor key={field.id} base={`${ base }.${ i }`} delayMode={delayMode} onRemove={() => fa.remove(i)} />
      ))}
    </div>
    );
}

function UdpMasksList({ base, isHysteria, network }: { base: string; isHysteria: boolean; network: string })
{
    const { control } = useFormContext();
    const fa = useFieldArray({ control, name: `${ base }.udp` });
    const addDefault = () =>
    {
        const def = isHysteria ? 'salamander' : 'mkcp-legacy';
        fa.append({ type: def, settings: defaultUdpMaskSettings(def) });
    };
    return (
    <div className="flex flex-col gap-3">
      <AddRow label="UDP Masks" onAdd={addDefault} />
      {fa.fields.map((field, i) => (
        <UdpMaskItem
          key={field.id}
          base={`${ base }.udp.${ i }`}
          parentBase={base}
          index={i + 1}
          isHysteria={isHysteria}
          network={network}
          onRemove={() => fa.remove(i)}
        />
      ))}
    </div>
    );
}

function UdpMaskItem({
    base,
    parentBase,
    index,
    isHysteria,
    network,
    onRemove
}: {
  base: string;
  parentBase: string;
  index: number;
  isHysteria: boolean;
  network: string;
  onRemove: () => void;
})
{
    const { setValue } = useFormContext();
    const type = useWatch({ name: `${ base }.type` }) as string | undefined;

    const onTypeChange = (v: string) =>
    {
        setValue(`${ base }.settings`, defaultUdpMaskSettings(v));
        if (network === 'kcp')
        {
            // Faithful to the AntD original: drops the list segment, lands on the finalmask base.
            setValue(`${ parentBase }.kcpSettings.mtu`, v === 'xdns' ? 900 : 1350);
        }
    };

    const options = isHysteria
        ? [{ value: 'salamander', label: 'Salamander (Hysteria2)' }]
        : [
            { value: 'mkcp-legacy', label: 'mKCP Legacy' },
            { value: 'xdns', label: 'xDNS' },
            { value: 'xicmp', label: 'xICMP' },
            { value: 'realm', label: 'Realm' },
            { value: 'header-custom', label: 'Header Custom' },
            { value: 'noise', label: 'Noise' }
        ];

    return (
    <div className="flex flex-col gap-3">
      <ItemHeader title={`UDP Mask ${ index }`} onRemove={onRemove} />
      <RHFField
        name={`${ base }.type`}
        label="Type"
        render={({ value, onChange }) => (
          <Select
            value={(value as string) ?? options[0].value}
            onChange={(v) =>
            {
                onChange(v);
                onTypeChange(v);
            }}
            options={options}
          />
        )}
      />
      {type === 'salamander' && (
        <RegenInput
          name={`${ base }.settings.password`}
          label="Password"
          placeholder="Obfuscation password"
          onRegen={() => setValue(`${ base }.settings.password`, RandomUtil.randomLowerAndNum(16))}
        />
      )}
      {type === 'mkcp-legacy' && (
        <>
          <RHFSelect
            name={`${ base }.settings.header`}
            label="Header"
            options={[
                { value: '', label: 'Original / AES-128-GCM' },
                { value: 'dns', label: 'DNS' },
                { value: 'dtls', label: 'DTLS 1.2' },
                { value: 'srtp', label: 'SRTP' },
                { value: 'utp', label: 'uTP' },
                { value: 'wechat', label: 'WeChat Video' },
                { value: 'wireguard', label: 'WireGuard' }
            ]}
          />
          <RHFText name={`${ base }.settings.value`} label="Value" placeholder="password (AES-128-GCM) or domain (DNS header)" />
        </>
      )}
      {type === 'xdns' && <RHFTags name={`${ base }.settings.domains`} label="Domains" />}
      {type === 'xicmp' && (
        <>
          <RHFSwitch name={`${ base }.settings.dgram`} label="Dgram" />
          <RHFTags name={`${ base }.settings.ips`} label="IPs" />
        </>
      )}
      {type === 'realm' && (
        <>
          <RHFText name={`${ base }.settings.url`} label="URL" placeholder="realm://token@host:port/id" />
          <RHFTags name={`${ base }.settings.stunServers`} label="STUN Servers" placeholder="host:port" />
        </>
      )}
      {type === 'header-custom' && <UdpHeaderCustom base={`${ base }.settings`} />}
      {type === 'noise' && <NoiseItems base={`${ base }.settings`} />}
    </div>
    );
}

// client/server: each is a flat array of items.
function UdpHeaderCustom({ base }: { base: string })
{
    return (
    <>
      {(['client', 'server'] as const).map((groupKey) => (
        <UdpItemsList key={groupKey} base={`${ base }.${ groupKey }`} label={groupKey === 'client' ? 'Client' : 'Server'} />
      ))}
    </>
    );
}

function UdpItemsList({ base, label }: { base: string; label: string })
{
    const { control } = useFormContext();
    const fa = useFieldArray({ control, name: base });
    return (
    <div className="flex flex-col gap-3">
      <AddRow label={label} onAdd={() => fa.append(defaultUdpClientServerItem())} />
      {fa.fields.map((field, i) => (
        <div key={field.id} className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <ItemHeader title={`${ label } ${ i + 1 }`} onRemove={() => fa.remove(i)} />
          <ItemEditor base={`${ base }.${ i }`} onRemove={() => fa.remove(i)} />
        </div>
      ))}
    </div>
    );
}

function NoiseItems({ base }: { base: string })
{
    const { control } = useFormContext();
    const fa = useFieldArray({ control, name: `${ base }.noise` });
    return (
    <div className="flex flex-col gap-3">
      <RHFNumber name={`${ base }.reset`} label="Reset" min={0} />
      <AddRow label="Noise" onAdd={() => fa.append(defaultNoiseItem())} />
      {fa.fields.map((field, i) => (
        <div key={field.id} className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <ItemHeader title={`Noise ${ i + 1 }`} onRemove={() => fa.remove(i)} />
          <ItemEditor base={`${ base }.noise.${ i }`} delayMode="string" onRemove={() => fa.remove(i)} />
        </div>
      ))}
    </div>
    );
}

function ItemEditor({
    base,
    delayMode,
    onRemove: _onRemove
}: {
  base: string;
  delayMode?: 'number' | 'string';
  onRemove?: () => void;
})
{
    const { setValue } = useFormContext();
    const type = useWatch({ name: `${ base }.type` }) as string | undefined;

    const onTypeChange = (v: string) =>
    {
        if (v === 'base64')
        {
            setValue(`${ base }.packet`, RandomUtil.randomBase64());
        }
        else if (v === 'array')
        {
            setValue(`${ base }.rand`, delayMode === 'string' ? '1-8192' : 0);
            setValue(`${ base }.packet`, []);
        }
        else
        {
            setValue(`${ base }.packet`, '');
        }
    };

    return (
    <>
      <RHFField
        name={`${ base }.type`}
        label="Type"
        render={({ value, onChange }) => (
          <Select
            value={(value as string) ?? 'array'}
            onChange={(v) =>
            {
                onChange(v);
                onTypeChange(v);
            }}
            options={[
                { value: 'array', label: 'Array' },
                { value: 'str', label: 'String' },
                { value: 'hex', label: 'Hex' },
                { value: 'base64', label: 'Base64' }
            ]}
          />
        )}
      />
      {delayMode === 'number' && <RHFNumber name={`${ base }.delay`} label="Delay (ms)" min={0} />}
      {delayMode === 'string' && <RHFText name={`${ base }.delay`} label="Delay" placeholder="10-20" />}

      {type === 'array' && (
        <>
          {delayMode === 'string' ? (
            <RHFText name={`${ base }.rand`} label="Rand" placeholder="0 or 1-8192" />
          ) : (
            <RHFNumber name={`${ base }.rand`} label="Rand" min={0} />
          )}
          <RHFText name={`${ base }.randRange`} label="Rand Range" placeholder="0-255" />
        </>
      )}
      {type === 'base64' && (
        <RegenInput
          name={`${ base }.packet`}
          label="Packet"
          placeholder="binary data"
          onRegen={() => setValue(`${ base }.packet`, RandomUtil.randomBase64())}
        />
      )}
      {type !== 'array' && type !== 'base64' && (
        <RHFText name={`${ base }.packet`} label="Packet" placeholder="binary data" />
      )}
    </>
    );
}

function QuicParamsForm({ base }: { base: string })
{
    const { setValue } = useFormContext();
    const congestion = useWatch({ name: `${ base }.congestion` }) as string | undefined;
    const hasUdpHop = useWatch({ name: `${ base }.udpHop` }) != null;

    return (
    <>
      <RHFSelect
        name={`${ base }.congestion`}
        label="Congestion"
        options={[
            { value: 'reno', label: 'Reno' },
            { value: 'bbr', label: 'BBR' },
            { value: 'brutal', label: 'Brutal' },
            { value: 'force-brutal', label: 'Force Brutal' }
        ]}
      />
      {congestion === 'bbr' && (
        <RHFSelect
          name={`${ base }.bbrProfile`}
          label="BBR Profile"
          placeholder="standard"
          options={[
              { value: '', label: 'standard' },
              { value: 'conservative', label: 'Conservative' },
              { value: 'standard', label: 'Standard' },
              { value: 'aggressive', label: 'Aggressive' }
          ]}
        />
      )}
      <RHFSwitch name={`${ base }.debug`} label="Debug" />
      {(congestion === 'brutal' || congestion === 'force-brutal') && (
        <>
          <RHFText name={`${ base }.brutalUp`} label="Brutal Up" placeholder="e.g. 60 mbps" />
          <RHFText name={`${ base }.brutalDown`} label="Brutal Down" placeholder="e.g. 100 mbps" />
        </>
      )}

      <div className="flex items-center justify-between gap-3">
        <Label>UDP Hop</Label>
        <Switch
          checked={hasUdpHop}
          aria-label="UDP Hop"
          onCheckedChange={(v) => setValue(`${ base }.udpHop`, v ? defaultUdpHop() : undefined)}
        />
      </div>
      {hasUdpHop && (
        <>
          <RHFText name={`${ base }.udpHop.ports`} label="Hop Ports" placeholder="e.g. 20000-50000" />
          <RHFText name={`${ base }.udpHop.interval`} label="Hop Interval (s)" placeholder="e.g. 5-10" />
        </>
      )}

      <RHFNumber name={`${ base }.maxIdleTimeout`} label="Max Idle Timeout (s)" min={4} max={120} />
      <RHFNumber name={`${ base }.keepAlivePeriod`} label="Keep Alive Period (s)" min={2} max={60} />
      <RHFSwitch name={`${ base }.disablePathMTUDiscovery`} label="Disable Path MTU Dis" />
      <RHFNumber name={`${ base }.maxIncomingStreams`} label="Max Incoming Streams" min={8} placeholder="1024 = default" />
      <RHFNumber name={`${ base }.initStreamReceiveWindow`} label="Init Stream Window" min={16384} placeholder="8388608 = default" />
      <RHFNumber name={`${ base }.maxStreamReceiveWindow`} label="Max Stream Window" min={16384} placeholder="8388608 = default" />
      <RHFNumber name={`${ base }.initConnectionReceiveWindow`} label="Init Conn Window" min={16384} placeholder="20971520 = default" />
      <RHFNumber name={`${ base }.maxConnectionReceiveWindow`} label="Max Conn Window" min={16384} placeholder="20971520 = default" />
    </>
    );
}
