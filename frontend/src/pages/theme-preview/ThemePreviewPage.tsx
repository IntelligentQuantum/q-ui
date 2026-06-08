import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { THEME_MODES, useTheme } from '@/hooks/useTheme';
import type { ThemeMode } from '@/hooks/useTheme';
import {
    Alert,
    Badge,
    Button,
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
    Checkbox,
    confirm,
    DropdownMenu,
    Input,
    Label,
    Modal,
    Select,
    Skeleton,
    Switch,
    Table,
    Tabs,
    Textarea,
    Tooltip
} from '@/components/ui';
import type { BadgeVariant, ButtonVariant, Column } from '@/components/ui';

/**
 * /theme-preview — a standalone gallery (no auth, outside PanelLayout) of every
 * design token and primitive in light / dark / ultra, plus an RTL toggle, so the
 * new theme can be eyeballed before it's rolled across the app. Token-only; uses
 * zero AntD.
 */

interface DemoForm {
  remark: string;
  port: string;
  protocol: string;
  enabled: boolean;
}

interface InboundRow {
  id: number;
  remark: string;
  protocol: string;
  trafficGb: number;
  enabled: boolean;
}

const INBOUNDS: InboundRow[] = [
    { id: 1, remark: 'germany-relay', protocol: 'vless', trafficGb: 412.5, enabled: true },
    { id: 2, remark: 'finland-direct', protocol: 'vmess', trafficGb: 88.1, enabled: true },
    { id: 3, remark: 'us-west-cdn', protocol: 'trojan', trafficGb: 1204.9, enabled: false },
    { id: 4, remark: 'tokyo-edge', protocol: 'vless', trafficGb: 322.0, enabled: true },
    { id: 5, remark: 'paris-backup', protocol: 'shadowsocks', trafficGb: 17.4, enabled: false },
    { id: 6, remark: 'london-core', protocol: 'vless', trafficGb: 905.2, enabled: true },
    { id: 7, remark: 'sydney-relay', protocol: 'vmess', trafficGb: 54.8, enabled: true },
    { id: 8, remark: 'toronto-edge', protocol: 'trojan', trafficGb: 233.7, enabled: true }
];

const SEMANTIC_SURFACES: Array<{ token: string; bg: string; fg?: string }> = [
    { token: 'background', bg: 'bg-background', fg: 'text-foreground' },
    { token: 'surface', bg: 'bg-surface', fg: 'text-foreground' },
    { token: 'surface-raised', bg: 'bg-surface-raised', fg: 'text-foreground' },
    { token: 'surface-sunken', bg: 'bg-surface-sunken', fg: 'text-foreground' },
    { token: 'primary', bg: 'bg-primary', fg: 'text-primary-foreground' },
    { token: 'accent', bg: 'bg-accent', fg: 'text-accent-foreground' },
    { token: 'success', bg: 'bg-success', fg: 'text-success-foreground' },
    { token: 'warning', bg: 'bg-warning', fg: 'text-warning-foreground' },
    { token: 'danger', bg: 'bg-danger', fg: 'text-danger-foreground' }
];

const FOREGROUNDS = [
    { token: 'foreground', cls: 'text-foreground' },
    { token: 'muted-foreground', cls: 'text-muted-foreground' },
    { token: 'accent (links)', cls: 'text-accent' }
];

const RADII = [
    { name: 'sm', cls: 'rounded-sm' },
    { name: 'md', cls: 'rounded-md' },
    { name: 'lg', cls: 'rounded-lg' },
    { name: 'xl', cls: 'rounded-xl' },
    { name: 'full', cls: 'rounded-full' }
];

const SHADOWS = [
    { name: 'xs', cls: 'shadow-xs' },
    { name: 'sm', cls: 'shadow-sm' },
    { name: 'md', cls: 'shadow-md' },
    { name: 'lg', cls: 'shadow-lg' }
];

const SPACING = [1, 2, 3, 4, 6, 8, 10, 12];
const BUTTON_VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger', 'link'];
const BADGE_VARIANTS: BadgeVariant[] = ['neutral', 'primary', 'success', 'warning', 'danger', 'outline'];

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode })
{
    return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
    );
}

export default function ThemePreviewPage()
{
    const { mode, setMode } = useTheme();
    const [rtl, setRtl] = useState(false);
    const [switchOn, setSwitchOn] = useState(true);
    const [checked, setChecked] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [lastConfirm, setLastConfirm] = useState<string>('—');
    const [protocol, setProtocol] = useState<string | null>('vless');
    const [submitted, setSubmitted] = useState('');
    const [tab, setTab] = useState('overview');
    const [seg, setSeg] = useState('day');

    const columns: Column<InboundRow>[] = [
        {
            key: 'remark',
            header: 'Remark',
            accessor: (r) => r.remark,
            sortable: true,
            cell: (r) => <span className="font-medium">{r.remark}</span>
        },
        {
            key: 'protocol',
            header: 'Protocol',
            accessor: (r) => r.protocol,
            sortable: true,
            cell: (r) => <Badge variant="primary">{r.protocol.toUpperCase()}</Badge>
        },
        {
            key: 'traffic',
            header: 'Traffic',
            align: 'end',
            accessor: (r) => r.trafficGb,
            sortable: true,
            cell: (r) => <span className="tabular-nums">{r.trafficGb.toFixed(1)} GB</span>
        },
        {
            key: 'status',
            header: 'Status',
            accessor: (r) => Number(r.enabled),
            sortable: true,
            cell: (r) =>
                r.enabled ? <Badge variant="success">Active</Badge> : <Badge variant="neutral">Disabled</Badge>
        },
        {
            key: 'actions',
            header: '',
            align: 'end',
            cell: () => (
        <DropdownMenu
          label="Row actions"
          items={[
              { key: 'edit', label: 'Edit' },
              { key: 'reset', label: 'Reset traffic' },
              { type: 'separator' },
              { key: 'del', label: 'Delete', danger: true }
          ]}
        />
            )
        }
    ];

    const {
        register,
        handleSubmit,
        control,
        reset,
        formState: { errors }
    } = useForm<DemoForm>({
        defaultValues: { remark: '', port: '', protocol: 'vless', enabled: true }
    });

    return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="min-h-screen bg-background text-foreground">
      {/* Sticky toolbar */}
      <header className="sticky top-0 z-10 border-b border-border bg-surface/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 p-4">
          <div className="me-auto flex flex-col">
            <span className="text-base font-semibold">Theme preview</span>
            <span className="text-xs text-muted-foreground">tokens · states · light / dark / ultra</span>
          </div>

          <div className="inline-flex items-center gap-1 rounded-md border border-border bg-surface p-1">
            {THEME_MODES.map((m: ThemeMode) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={
                  'rounded-[0.3rem] px-3 py-1 text-sm font-medium capitalize outline-none transition-colors ' +
                  'focus-visible:ring-2 focus-visible:ring-ring ' +
                  (mode === m
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-surface-sunken hover:text-foreground')
                }
              >
                {m}
              </button>
            ))}
          </div>

          <Button variant="secondary" size="sm" onClick={() => setRtl((v) => !v)}>
            {rtl ? 'LTR' : 'RTL'}
          </Button>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-12 p-6 pb-24">
        {/* Colors */}
        <Section title="Semantic colors" hint="Components reference these names only — never a raw hex.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            {SEMANTIC_SURFACES.map((s) => (
              <div
                key={s.token}
                className={`flex h-20 flex-col justify-end rounded-lg border border-border p-2 ${ s.bg } ${ s.fg ?? '' }`}
              >
                <span className="text-xs font-medium">{s.token}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-6 rounded-lg border border-border bg-surface p-4">
            {FOREGROUNDS.map((f) => (
              <div key={f.token} className="flex flex-col gap-1">
                <span className={`text-sm font-medium ${ f.cls }`}>The quick brown fox</span>
                <span className="text-xs text-muted-foreground">{f.token}</span>
              </div>
            ))}
          </div>
          {/* Literal classes (Tailwind can't scan dynamically-built names). */}
          <div className="flex flex-wrap gap-3">
            <div className="rounded-md bg-success-subtle px-3 py-2 text-sm font-medium text-success">success-subtle</div>
            <div className="rounded-md bg-warning-subtle px-3 py-2 text-sm font-medium text-warning">warning-subtle</div>
            <div className="rounded-md bg-danger-subtle px-3 py-2 text-sm font-medium text-danger">danger-subtle</div>
            <div className="rounded-md bg-accent-subtle px-3 py-2 text-sm font-medium text-accent">accent-subtle</div>
          </div>
        </Section>

        {/* Radius */}
        <Section title="Radius scale" hint="5 steps. cards = lg, inputs/buttons = md, pills = full.">
          <div className="flex flex-wrap items-end gap-4">
            {RADII.map((r) => (
              <div key={r.name} className="flex flex-col items-center gap-2">
                <div className={`h-16 w-16 border border-border bg-surface-sunken ${ r.cls }`} />
                <span className="text-xs text-muted-foreground">{r.name}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Elevation */}
        <Section title="Elevation" hint="Soft, layered shadows — no heavy black slabs. Dark/ultra lean on lighter surfaces too.">
          <div className="flex flex-wrap gap-6">
            {SHADOWS.map((s) => (
              <div key={s.name} className="flex flex-col items-center gap-2">
                <div className={`h-16 w-24 rounded-lg border border-border bg-surface ${ s.cls }`} />
                <span className="text-xs text-muted-foreground">{s.name}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Spacing */}
        <Section title="Spacing" hint="Strict 4px base (Tailwind scale). No 5/7px off-grid values.">
          <div className="flex flex-col gap-2">
            {SPACING.map((n) => (
              <div key={n} className="flex items-center gap-3">
                <span className="w-10 text-xs text-muted-foreground">{n * 4}px</span>
                <div className="h-3 rounded-sm bg-accent" style={{ width: `${ n * 0.25 }rem` }} />
              </div>
            ))}
          </div>
        </Section>

        {/* Typography */}
        <Section title="Typography" hint="14px base, consistent hierarchy.">
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-5">
            <p className="text-3xl font-bold">Heading 3xl / 700</p>
            <p className="text-xl font-semibold">Heading xl / 600</p>
            <p className="text-base font-medium">Body base / 500</p>
            <p className="text-sm">Body sm / 400 — default UI text</p>
            <p className="text-xs text-muted-foreground">Caption xs / muted</p>
          </div>
        </Section>

        {/* Buttons */}
        <Section title="Buttons" hint="Default / hover / active / focus-visible / disabled / loading. Tab to a button to see the focus ring.">
          <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
            <div className="flex flex-wrap items-center gap-3">
              {BUTTON_VARIANTS.map((v) => (
                <Button key={v} variant={v}>
                  {v}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled>Disabled</Button>
              <Button variant="secondary" disabled>
                Disabled
              </Button>
              <Button loading>Loading</Button>
              <Button variant="secondary" loading>
                Loading
              </Button>
            </div>
          </div>
        </Section>

        {/* Form controls */}
        <Section title="Form controls" hint="Inputs, switches and checkboxes with default / focus / invalid / disabled states.">
          <div className="grid gap-6 rounded-lg border border-border bg-surface p-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="tp-name">Name</Label>
              <Input id="tp-name" placeholder="Enter your name" defaultValue="Mehrshad" />
              <Label htmlFor="tp-err">Invalid</Label>
              <Input id="tp-err" aria-invalid defaultValue="not-an-email" />
              <Label htmlFor="tp-dis">Disabled</Label>
              <Input id="tp-dis" disabled placeholder="Disabled" />
            </div>
            <div className="flex flex-col gap-3">
              <Label htmlFor="tp-bio">Bio</Label>
              <Textarea id="tp-bio" placeholder="A few words…" />
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch id="tp-sw" checked={switchOn} onCheckedChange={setSwitchOn} aria-label="Toggle" />
                  <Label htmlFor="tp-sw">Switch ({switchOn ? 'on' : 'off'})</Label>
                </div>
                <Switch checked={false} disabled aria-label="Disabled switch" />
              </div>
              <div className="flex items-center gap-6">
                <Checkbox checked={checked} onChange={(e) => setChecked(e.target.checked)}>
                  Checkbox
                </Checkbox>
                <Checkbox checked disabled>
                  Disabled
                </Checkbox>
              </div>
            </div>
          </div>
        </Section>

        {/* Badges */}
        <Section title="Badges">
          <div className="flex flex-wrap gap-2">
            {BADGE_VARIANTS.map((v) => (
              <Badge key={v} variant={v}>
                {v}
              </Badge>
            ))}
          </div>
        </Section>

        {/* Alerts */}
        <Section title="Alerts">
          <div className="flex flex-col gap-3">
            <Alert variant="info" title="Heads up">This is an informational message.</Alert>
            <Alert variant="success" title="Saved">Your changes were saved successfully.</Alert>
            <Alert variant="warning" title="Careful">This action may have side effects.</Alert>
            <Alert variant="danger" title="Error">Something went wrong. Please try again.</Alert>
          </div>
        </Section>

        {/* Card + skeleton */}
        <Section title="Card & skeleton">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Inbound traffic</CardTitle>
                <CardDescription>Last 30 days across all nodes.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold tabular-nums">1.42 TB</span>
                  <Badge variant="success">+12%</Badge>
                </div>
              </CardContent>
              <CardFooter>
                <Button size="sm">View report</Button>
                <Button size="sm" variant="ghost">
                  Dismiss
                </Button>
              </CardFooter>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Loading…</CardTitle>
                <CardDescription>Skeleton placeholders.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-24 w-full" />
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* Menus & selects */}
        <Section title="Select & menu" hint="Custom listbox select and dropdown menu — full keyboard nav, outside-click/Esc, RTL-aware. No native select, no Radix.">
          <div className="grid gap-4 rounded-lg border border-border bg-surface p-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="tp-proto">Protocol</Label>
              <Select
                id="tp-proto"
                value={protocol}
                onChange={setProtocol}
                options={[
                    { value: 'vless', label: 'VLESS' },
                    { value: 'vmess', label: 'VMess' },
                    { value: 'trojan', label: 'Trojan' },
                    { value: 'shadowsocks', label: 'Shadowsocks' },
                    { value: 'wireguard', label: 'WireGuard (disabled)', disabled: true }
                ]}
              />
              <span className="text-xs text-muted-foreground">selected: {protocol ?? '—'}</span>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Row actions</Label>
              <div className="flex items-center gap-3">
                <DropdownMenu
                  label="Row actions"
                  items={[
                      { key: 'edit', label: 'Edit' },
                      { key: 'dup', label: 'Duplicate' },
                      { type: 'separator' },
                      { key: 'del', label: 'Delete', danger: true }
                  ]}
                />
                <DropdownMenu
                  align="start"
                  trigger="Actions"
                  label="Actions"
                  items={[
                      { key: 'export', label: 'Export' },
                      { key: 'reset', label: 'Reset usage' },
                      { key: 'disabled', label: 'Unavailable', disabled: true }
                  ]}
                />
              </div>
            </div>
          </div>
        </Section>

        {/* Tabs */}
        <Section title="Tabs" hint="Underline and segmented variants. Arrow keys to navigate; horizontally scrollable on mobile.">
          <div className="flex flex-col gap-6 rounded-lg border border-border bg-surface p-5">
            <div className="flex flex-col gap-3">
              <Tabs
                aria-label="Sections"
                value={tab}
                onChange={setTab}
                tabs={[
                    { key: 'overview', label: 'Overview' },
                    { key: 'traffic', label: 'Traffic' },
                    { key: 'clients', label: 'Clients' },
                    { key: 'settings', label: 'Settings', disabled: true }
                ]}
              />
              <p className="text-sm text-muted-foreground">
                Active tab: <span className="font-medium text-foreground">{tab}</span>
              </p>
            </div>
            <Tabs
              variant="segmented"
              fullWidth
              aria-label="Range"
              value={seg}
              onChange={setSeg}
              tabs={[
                  { key: 'day', label: 'Day' },
                  { key: 'week', label: 'Week' },
                  { key: 'month', label: 'Month' }
              ]}
            />
          </div>
        </Section>

        {/* Table */}
        <Section title="Table" hint="Sortable columns (click a header), pagination, hover rows, row-action menus. Scrolls horizontally on small screens.">
          <Table
            columns={columns}
            data={INBOUNDS}
            rowKey={(r) => String(r.id)}
            pageSize={5}
            onRowClick={() =>
            {}}
          />
        </Section>

        {/* Form — react-hook-form */}
        <Section
          title="Form (react-hook-form)"
          hint="Validation via react-hook-form — NOT AntD Form. Pure Tailwind primitives. Submit empty to see errors."
        >
          <form
            noValidate
            onSubmit={handleSubmit((data) => setSubmitted(JSON.stringify(data)))}
            className="grid gap-4 rounded-lg border border-border bg-surface p-5 sm:grid-cols-2"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-remark">Remark</Label>
              <Input
                id="f-remark"
                placeholder="My inbound"
                aria-invalid={!!errors.remark}
                {...register('remark', { required: 'Remark is required' })}
              />
              {errors.remark && <span className="text-xs text-danger">{errors.remark.message}</span>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-port">Port</Label>
              <Input
                id="f-port"
                inputMode="numeric"
                placeholder="443"
                aria-invalid={!!errors.port}
                {...register('port', {
                    required: 'Port is required',
                    pattern: { value: /^\d+$/, message: 'Numbers only' },
                    validate: (v) => (Number(v) >= 1 && Number(v) <= 65535) || 'Port must be 1–65535'
                })}
              />
              {errors.port && <span className="text-xs text-danger">{errors.port.message}</span>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-proto">Protocol</Label>
              <Controller
                control={control}
                name="protocol"
                render={({ field }) => (
                  <Select
                    id="f-proto"
                    value={field.value}
                    onChange={field.onChange}
                    options={[
                        { value: 'vless', label: 'VLESS' },
                        { value: 'vmess', label: 'VMess' },
                        { value: 'trojan', label: 'Trojan' }
                    ]}
                  />
                )}
              />
            </div>

            <div className="flex items-end">
              <Controller
                control={control}
                name="enabled"
                render={({ field }) => (
                  <label className="flex items-center gap-2">
                    <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Enabled" />
                    <span className="text-sm text-foreground">Enabled</span>
                  </label>
                )}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <Button type="submit">Create</Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                {
                    reset();
                    setSubmitted('');
                }}
              >
                Reset
              </Button>
              {submitted && (
                <span className="text-xs text-muted-foreground">
                  submitted: <code className="text-foreground">{submitted}</code>
                </span>
              )}
            </div>
          </form>
        </Section>

        {/* Overlays */}
        <Section title="Overlays" hint="Modal (focus-trapped, Esc to close, scroll-locked), imperative confirm(), and tooltips. Hand-built — no Radix.">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-5">
            <Button onClick={() => setModalOpen(true)}>Open modal</Button>
            <Button
              variant="danger"
              onClick={async () =>
              {
                  const ok = await confirm({
                      title: 'Delete inbound?',
                      description: 'This permanently removes the inbound and its clients. This cannot be undone.',
                      confirmText: 'Delete',
                      danger: true
                  });
                  setLastConfirm(ok ? 'confirmed' : 'cancelled');
              }}
            >
              Delete (confirm)
            </Button>
            <span className="text-sm text-muted-foreground">
              last confirm: <span className="font-medium text-foreground">{lastConfirm}</span>
            </span>
            <Tooltip content="Tooltip on top">
              <Button variant="secondary">Hover me</Button>
            </Tooltip>
            <Tooltip content="On the end side" side="end">
              <Button variant="ghost">End</Button>
            </Tooltip>
          </div>

          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Edit profile"
            description="Update your display name. Press Esc or click outside to dismiss."
            footer={
              <>
                <Button variant="secondary" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => setModalOpen(false)}>Save changes</Button>
              </>
            }
          >
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="tp-modal-name">Display name</Label>
                <Input id="tp-modal-name" defaultValue="Mehrshad" />
              </div>
              <Checkbox defaultChecked>Email me about account activity</Checkbox>
            </div>
          </Modal>
        </Section>
      </main>
    </div>
    );
}
