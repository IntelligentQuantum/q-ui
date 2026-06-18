import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { LayoutGrid, CircleCheck, CircleX, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatCard, SearchInput } from '@/components/ui';

import { HttpUtil } from '@/utils';
import { getMessage } from '@/utils/messageBus';
import PageShell from '@/layouts/PageShell';
import {
    Badge,
    Button,
    Card,
    Checkbox,
    DropdownMenu,
    Input,
    Label,
    Modal,
    Select,
    Switch,
    Table,
    TableSkeleton,
    Textarea,
    ErrorState,
    confirm
} from '@/components/ui';
import type { Column } from '@/components/ui';

// The panel's axios defaults to form-urlencoded; backend product/order handlers
// bind JSON, so these mutations must declare a JSON content-type (matches the
// JSON_HEADERS convention used across the app, e.g. UsersPage/BillingPage).
const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } } as const;

interface Product {
  id: number;
  name: string;
  description: string;
  trafficLimit: number;
  durationDays: number;
  price: number;
  audience: string;
  inboundIds: number[];
  status: string;
}

interface InboundOption {
  id: number;
  remark: string;
  protocol: string;
  port: number;
}

interface ProductForm {
  name: string;
  description: string;
  price: number;
  trafficLimit: number;
  durationDays: number;
  audience: string;
  inboundIds: number[];
  status?: string;
}

// One labelled form row: label, control, optional hint.
function Field({
    label,
    htmlFor,
    hint,
    error,
    children
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
})
{
    return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <span className="text-xs text-danger">{error}</span>
      ) : hint ? (
        <span className="text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </div>
    );
}

// ProductsPage is the catalog manager for admin + moderator (gated by
// product.manage on the backend). Create/edit/delete/activate all hit
// /panel/api/products/*; the backend re-checks the permission on every call.
export default function ProductsPage()
{
    const { t } = useTranslation();
    const qc = useQueryClient();
    // The catalog is the current storefront's (the /manager/<slug> URL); key on it
    // so navigating between workspaces refetches instead of reusing the cache.
    const { tenantSlug } = useParams();
    const [editing, setEditing] = useState<Product | null>(null);
    const [open, setOpen] = useState(false);

    const {
        register,
        handleSubmit,
        reset,
        control,
        formState: { errors }
    } = useForm<ProductForm>({
        defaultValues: { name: '', description: '', price: 0, trafficLimit: 0, durationDays: 0, audience: 'all', inboundIds: [], status: 'active' }
    });

    const { data: products, isLoading, isError, refetch } = useQuery({
        queryKey: ['products', 'manage', tenantSlug ?? ''],
        queryFn: async () =>
        {
            const msg = await HttpUtil.get('/panel/api/products', undefined, { silent: true });
            if (!msg?.success)
            {
                throw new Error(msg?.msg || '');
            }
            return (msg.obj as Product[] | null) ?? [];
        }
    });

    // Inbound options drive which inbound a purchased config is provisioned on.
    const { data: inbounds } = useQuery({
        queryKey: ['inbounds', 'options'],
        queryFn: async () =>
        {
            const msg = await HttpUtil.get('/panel/api/inbounds/options', undefined, { silent: true });
            return (msg.obj as InboundOption[] | null) ?? [];
        }
    });
    const inboundLabel = (id: number) =>
    {
        const ib = inbounds?.find((i) => i.id === id);
        if (!ib)
        {
            return id ? `#${ id }` : '—';
        }
        // Just the remark/name is enough to identify the inbound.
        return ib.remark || `#${ ib.id }`;
    };

    const audienceLabel = (a: string) =>
        a === 'reseller'
            ? t('pages.products.audienceReseller')
            : a === 'member'
                ? t('pages.products.audienceMember')
                : t('pages.products.audienceAll');

    const list = products ?? [];
    const [q, setQ] = useState('');
    const [statusFilter, setStatusFilter] = useState<string | undefined>();
    const stats = useMemo(() =>
    {
        const active = list.filter((p) => p.status === 'active').length;
        return { total: list.length, active, inactive: list.length - active };
    }, [list]);

    const filtered = useMemo(() =>
    {
        const s = q.trim().toLowerCase();
        return list.filter((p) =>
        {
            if (statusFilter && p.status !== statusFilter)
            {
                return false;
            }
            if (!s)
            {
                return true;
            }
            return p.name.toLowerCase().includes(s);
        });
    }, [list, q, statusFilter]);

    const invalidate = () => qc.invalidateQueries({ queryKey: ['products'] });

    const save = useMutation({
        mutationFn: async (values: ProductForm) =>
        {
            const url = editing ? `/panel/api/products/${ editing.id }` : '/panel/api/products';
            return HttpUtil.post(url, values, { ...JSON_HEADERS, silent: true });
        },
        onSuccess: (msg) =>
        {
            if (msg.success)
            {
                getMessage().success(t('pages.products.saved'));
                setOpen(false);
                setEditing(null);
                reset();
                invalidate();
            }
            else
            {
                getMessage().error(msg.msg || t('somethingWentWrong'));
            }
        }
    });

    const remove = async (id: number) =>
    {
        const ok = await confirm({ title: t('pages.products.confirmDelete'), danger: true });
        if (!ok)
        {
            return;
        }
        const msg = await HttpUtil.post(`/panel/api/products/${ id }/del`, undefined, { silent: true });
        if (msg.success)
        {
            getMessage().success(t('pages.products.deleted'));
            invalidate();
        }
        else
        {
            getMessage().error(msg.msg || t('somethingWentWrong'));
        }
    };

    const toggle = async (p: Product) =>
    {
        const msg = await HttpUtil.post(`/panel/api/products/${ p.id }/status`, { active: p.status !== 'active' }, { ...JSON_HEADERS, silent: true });
        if (msg.success)
        {
            getMessage().success(t('pages.products.statusChanged'));
            invalidate();
        }
        else
        {
            getMessage().error(msg.msg || t('somethingWentWrong'));
        }
    };

    const openCreate = () =>
    {
        setEditing(null);
        reset({ name: '', description: '', price: 0, trafficLimit: 0, durationDays: 0, audience: 'all', inboundIds: [], status: 'active' });
        setOpen(true);
    };

    const openEdit = (p: Product) =>
    {
        setEditing(p);
        reset({
            name: p.name,
            description: p.description ?? '',
            price: p.price,
            trafficLimit: p.trafficLimit,
            durationDays: p.durationDays,
            audience: p.audience ?? 'all',
            inboundIds: p.inboundIds ?? [],
            status: p.status
        });
        setOpen(true);
    };

    const columns: Column<Product>[] = [
        { key: 'name', header: t('pages.products.name'), accessor: (p) => p.name },
        { key: 'price', header: t('pages.products.price'), cell: (p) => p.price },
        { key: 'durationDays', header: t('pages.products.durationDays'), hideBelow: 'sm', cell: (p) => p.durationDays },
        {
            key: 'audience',
            header: t('pages.products.audience'),
            hideBelow: 'sm',
            cell: (p) =>
            {
                const a = p.audience || 'all';
                const variant = a === 'reseller' ? 'primary' : a === 'member' ? 'success' : 'neutral';
                return <Badge variant={variant}>{audienceLabel(a)}</Badge>;
            }
        },
        {
            key: 'inbound',
            header: t('pages.products.inbound'),
            hideBelow: 'md',
            cell: (p) => (p.inboundIds && p.inboundIds.length ? p.inboundIds.map(inboundLabel).join(', ') : '—')
        },
        {
            key: 'status',
            header: t('pages.products.status'),
            cell: (p) => <Switch checked={p.status === 'active'} onCheckedChange={() => toggle(p)} aria-label={t('pages.products.status')} />
        },
        {
            key: 'actions',
            header: '',
            align: 'end',
            width: 64,
            cell: (p) => (
        <DropdownMenu
          align="end"
          items={[
              { key: 'edit', label: t('edit'), onSelect: () => openEdit(p) },
              { key: 'delete', label: t('delete'), danger: true, onSelect: () => remove(p.id) }
          ]}
        />
            )
        }
    ];

    const submit = handleSubmit((v) => save.mutate(v));

    return (
    <PageShell
      name="products-page"
      actions={
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" aria-hidden />
          {t('pages.products.create')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard icon={<LayoutGrid className="h-5 w-5" aria-hidden />} label={t('pages.products.total')} value={stats.total} />
          <StatCard icon={<CircleCheck className="h-5 w-5 text-success" aria-hidden />} label={t('pages.products.activeCount')} value={stats.active} />
          <StatCard icon={<CircleX className="h-5 w-5 text-danger" aria-hidden />} label={t('pages.products.inactiveCount')} value={stats.inactive} />
        </div>

        <Card className="p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Select
                className="min-w-[130px]"
                placeholder={t('pages.products.status')}
                value={statusFilter ?? ''}
                onChange={(v) => setStatusFilter(v || undefined)}
                options={[
                    { value: '', label: t('all') },
                    { value: 'active', label: t('pages.products.statusActive') },
                    { value: 'inactive', label: t('pages.products.statusInactive') }
                ]}
              />
              <SearchInput
                className="w-full sm:w-52"
                aria-label={t('search')}
                placeholder={t('search')}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>

          {isLoading ? (
            <TableSkeleton rows={6} />
          ) : isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : (
            <Table rowKey={(p) => String(p.id)} columns={columns} data={filtered} empty={t('noData')} />
          )}
        </Card>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? t('pages.products.edit') : t('pages.products.create')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={submit} loading={save.isPending}>
              {t('save')}
            </Button>
          </>
        }
      >
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <Field label={t('pages.products.name')} htmlFor="prod-name" error={errors.name?.message}>
            <Input
              id="prod-name"
              aria-invalid={!!errors.name}
              {...register('name', { required: t('pages.settings.security.apiTokenNameRequired') })}
            />
          </Field>

          <Field label={t('pages.products.descLabel')} htmlFor="prod-desc" hint={t('pages.products.descriptionHint')}>
            <Textarea id="prod-desc" rows={3} {...register('description')} />
          </Field>

          <Field label={t('pages.products.price')} htmlFor="prod-price" error={errors.price?.message}>
            <Input
              id="prod-price"
              type="number"
              min={0}
              aria-invalid={!!errors.price}
              {...register('price', { required: true, valueAsNumber: true, min: 0 })}
            />
          </Field>

          <Field label={t('pages.products.trafficLimitBytes')} htmlFor="prod-traffic">
            <Input id="prod-traffic" type="number" min={0} {...register('trafficLimit', { valueAsNumber: true, min: 0 })} />
          </Field>

          <Field label={t('pages.products.durationDays')} htmlFor="prod-duration">
            <Input id="prod-duration" type="number" min={0} {...register('durationDays', { valueAsNumber: true, min: 0 })} />
          </Field>

          <Field label={t('pages.products.audience')} hint={t('pages.products.audienceHint')}>
            <Controller
              control={control}
              name="audience"
              render={({ field }) => (
                <Select
                  value={(field.value as string) ?? 'all'}
                  onChange={field.onChange}
                  options={[
                      { value: 'all', label: t('pages.products.audienceAll') },
                      { value: 'reseller', label: t('pages.products.audienceReseller') },
                      { value: 'member', label: t('pages.products.audienceMember') }
                  ]}
                />
              )}
            />
          </Field>

          <Field label={t('pages.products.inbound')} hint={t('pages.products.inboundHint')}>
            <Controller
              control={control}
              name="inboundIds"
              render={({ field }) =>
              {
                  const selected = field.value ?? [];
                  const toggleId = (id: number, checked: boolean) =>
                      field.onChange(checked ? [...selected.filter((x) => x !== id), id] : selected.filter((x) => x !== id));
                  return (inbounds ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('pages.products.inboundNone')}</p>
                  ) : (
                  <div className="flex max-h-44 flex-col gap-2 overflow-y-auto rounded-md border border-border p-3">
                    {(inbounds ?? []).map((i) => (
                      <Checkbox
                        key={i.id}
                        checked={selected.includes(i.id)}
                        onChange={(e) => toggleId(i.id, e.target.checked)}
                      >
                        {i.remark || `#${ i.id }`}
                      </Checkbox>
                    ))}
                  </div>
                  );
              }}
            />
          </Field>
        </form>
      </Modal>
    </PageShell>
    );
}
