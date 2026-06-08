import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm, Controller } from 'react-hook-form';
import { Fingerprint, Hash, KeyRound, Route, Server, Tag } from 'lucide-react';
import { message } from '@/components/ui/message';
import {
    Alert,
    Button,
    Input,
    Label,
    Modal,
    PasswordInput,
    Select,
    Switch
} from '@/components/ui';
import type { NodeRecord } from '@/api/queries/useNodesQuery';
import type { Msg } from '@/utils';
import { NodeFormSchema, type NodeFormValues, type ProbeResult } from '@/schemas/node';

type Mode = 'add' | 'edit';

interface NodeFormModalProps {
  open: boolean;
  mode: Mode;
  node: NodeRecord | null;
  testConnection: (payload: Partial<NodeRecord>) => Promise<Msg<ProbeResult>>;
  fetchFingerprint: (payload: Partial<NodeRecord>) => Promise<Msg<string>>;
  save: (payload: Partial<NodeRecord>) => Promise<Msg<unknown>>;
  onOpenChange: (open: boolean) => void;
}

function defaultValues(): NodeFormValues
{
    return {
        id: 0,
        name: '',
        remark: '',
        scheme: 'https',
        address: '',
        port: 2053,
        basePath: '/',
        apiToken: '',
        enable: true,
        allowPrivateAddress: false,
        tlsVerifyMode: 'verify',
        pinnedCertSha256: ''
    };
}

// One labelled form field: label, control, optional hint + validation error.
function Field({
    label,
    htmlFor,
    hint,
    error,
    className,
    children
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string;
  className?: string;
  children: ReactNode;
})
{
    return (
    <div className={className ?? 'flex flex-col gap-1.5'}>
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

export default function NodeFormModal({
    open,
    mode,
    node,
    testConnection,
    fetchFingerprint,
    save,
    onOpenChange
}: NodeFormModalProps)
{
    const { t } = useTranslation();
    const [messageApi, messageContextHolder] = message.useMessage();

    const [submitting, setSubmitting] = useState(false);
    const [testing, setTesting] = useState(false);
    const [fetchingPin, setFetchingPin] = useState(false);
    const [testResult, setTestResult] = useState<ProbeResult | null>(null);

    const {
        register,
        handleSubmit,
        control,
        reset,
        watch,
        getValues,
        setValue,
        trigger,
        formState: { errors }
    } = useForm<NodeFormValues>({ defaultValues: defaultValues() });

    const scheme = watch('scheme') ?? 'https';
    const tlsVerifyMode = watch('tlsVerifyMode') ?? 'verify';

    useEffect(() =>
    {
        if (!open)
        {
            return;
        }
        const base = defaultValues();
        const next: NodeFormValues = mode === 'edit' && node
            ? {
                ...base,
                ...(node as unknown as Partial<NodeFormValues>),
                id: node.id,
                scheme: (node.scheme as 'http' | 'https') || base.scheme
            }
            : base;
        if (next.scheme === 'http')
        {
            next.tlsVerifyMode = 'skip';
        }
        reset(next);
        setTestResult(null);
    }, [open, mode, node, reset]);

    const title = useMemo(
        () => (mode === 'edit' ? t('pages.nodes.editNode') : t('pages.nodes.addNode')),
        [mode, t]
    );

    function buildPayload(values: NodeFormValues): Partial<NodeRecord>
    {
        return {
            id: values.id || 0,
            name: values.name.trim(),
            remark: values.remark?.trim() || '',
            scheme: values.scheme,
            address: values.address.trim(),
            port: values.port,
            basePath: values.basePath.trim() || '/',
            apiToken: values.apiToken.trim(),
            enable: values.enable,
            allowPrivateAddress: values.allowPrivateAddress,
            tlsVerifyMode: values.tlsVerifyMode,
            pinnedCertSha256: values.tlsVerifyMode === 'pin' ? values.pinnedCertSha256.trim() : ''
        };
    }

    async function onTest()
    {
        const ok = await trigger(['address', 'port']);
        if (!ok)
        {
            return;
        }
        setTesting(true);
        setTestResult(null);
        try
        {
            const payload = buildPayload(getValues());
            const msg = await testConnection(payload);
            if (msg?.success && msg.obj)
            {
                setTestResult(msg.obj);
            }
            else
            {
                setTestResult({ status: 'offline', error: msg?.msg || 'unknown error' });
            }
        }
        finally
        {
            setTesting(false);
        }
    }

    async function onFetchPin()
    {
        const ok = await trigger(['address', 'port']);
        if (!ok)
        {
            return;
        }
        setFetchingPin(true);
        try
        {
            const payload = buildPayload(getValues());
            const msg = await fetchFingerprint(payload);
            if (msg?.success && msg.obj)
            {
                setValue('pinnedCertSha256', msg.obj);
                messageApi.success(t('pages.nodes.pinFetched'));
            }
            else
            {
                messageApi.error(msg?.msg || t('pages.nodes.pinFetchFailed'));
            }
        }
        finally
        {
            setFetchingPin(false);
        }
    }

    const onFinish = handleSubmit(async (values) =>
    {
        const result = NodeFormSchema.safeParse(values);
        if (!result.success)
        {
            messageApi.error(t(result.error.issues[0]?.message ?? 'pages.nodes.toasts.fillRequired'));
            return;
        }
        setSubmitting(true);
        try
        {
            const payload = buildPayload(result.data);
            const test = await testConnection(payload);
            const probe = test?.success ? test.obj : null;
            if (!probe || probe.status !== 'online')
            {
                setTestResult(probe ?? { status: 'offline', error: test?.msg || t('pages.nodes.connectionFailed') });
                return;
            }
            setTestResult(probe);
            const msg = await save(payload);
            if (msg?.success)
            {
                onOpenChange(false);
            }
        }
        finally
        {
            setSubmitting(false);
        }
    });

    function close()
    {
        if (!submitting)
        {
            onOpenChange(false);
        }
    }

    const nameError = errors.name ? t(errors.name.message ?? 'pages.nodes.toasts.fillRequired') : undefined;
    const addressError = errors.address ? t(errors.address.message ?? 'pages.nodes.toasts.fillRequired') : undefined;
    const portError = errors.port ? t(errors.port.message ?? 'pages.nodes.toasts.fillRequired') : undefined;
    const apiTokenError = errors.apiToken ? t(errors.apiToken.message ?? 'pages.nodes.toasts.fillRequired') : undefined;

    return (
    <>
      {messageContextHolder}
      <Modal
        open={open}
        onClose={close}
        size="lg"
        title={title}
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={submitting}>
              {t('cancel')}
            </Button>
            <Button onClick={() => onFinish()} loading={submitting}>
              {t('save')}
            </Button>
          </>
        }
      >
        <form noValidate onSubmit={onFinish} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label={t('pages.nodes.name')} htmlFor="node-name" error={nameError}>
              <Input
                id="node-name"
                startIcon={<Tag aria-hidden />}
                placeholder={t('pages.nodes.namePlaceholder')}
                aria-invalid={!!errors.name}
                {...register('name', { required: 'pages.nodes.toasts.fillRequired' })}
              />
            </Field>
            <Field label={t('pages.nodes.remark')} htmlFor="node-remark">
              <Input id="node-remark" {...register('remark')} />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
            <Field label={t('pages.nodes.scheme')} htmlFor="node-scheme" className="flex flex-col gap-1.5 md:col-span-3">
              <Controller
                control={control}
                name="scheme"
                render={({ field }) => (
                  <Select
                    id="node-scheme"
                    value={field.value}
                    onChange={(value) =>
                    {
                        field.onChange(value);
                        if (value === 'http')
                        {
                            setValue('tlsVerifyMode', 'skip');
                        }
                    }}
                    options={[
                        { value: 'https', label: 'https' },
                        { value: 'http', label: 'http' }
                    ]}
                  />
                )}
              />
            </Field>
            <Field label={t('pages.nodes.address')} htmlFor="node-address" error={addressError} className="flex flex-col gap-1.5 md:col-span-6">
              <Input
                id="node-address"
                startIcon={<Server aria-hidden />}
                placeholder={t('pages.nodes.addressPlaceholder')}
                aria-invalid={!!errors.address}
                {...register('address', { required: 'pages.nodes.toasts.fillRequired' })}
              />
            </Field>
            <Field label={t('pages.nodes.port')} htmlFor="node-port" error={portError} className="flex flex-col gap-1.5 md:col-span-3">
              <Input
                id="node-port"
                type="number"
                min={1}
                max={65535}
                startIcon={<Hash aria-hidden />}
                aria-invalid={!!errors.port}
                {...register('port', {
                    valueAsNumber: true,
                    required: 'pages.nodes.toasts.fillRequired',
                    min: { value: 1, message: 'pages.nodes.toasts.fillRequired' },
                    max: { value: 65535, message: 'pages.nodes.toasts.fillRequired' }
                })}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label={t('pages.nodes.basePath')} htmlFor="node-basepath">
              <Input id="node-basepath" startIcon={<Route aria-hidden />} placeholder="/" {...register('basePath')} />
            </Field>
            <Field label={t('pages.nodes.enable')} htmlFor="node-enable">
              <Controller
                control={control}
                name="enable"
                render={({ field }) => (
                  <Switch id="node-enable" checked={!!field.value} onCheckedChange={field.onChange} />
                )}
              />
            </Field>
          </div>

          <Field label={t('pages.nodes.allowPrivateAddress')} htmlFor="node-allowprivate" hint={t('pages.nodes.allowPrivateAddressHint')}>
            <Controller
              control={control}
              name="allowPrivateAddress"
              render={({ field }) => (
                <Switch id="node-allowprivate" checked={!!field.value} onCheckedChange={field.onChange} />
              )}
            />
          </Field>

          <Field label={t('pages.nodes.tlsVerifyMode')} htmlFor="node-tlsmode" hint={t('pages.nodes.tlsVerifyModeHint')}>
            <Controller
              control={control}
              name="tlsVerifyMode"
              render={({ field }) => (
                <Select
                  id="node-tlsmode"
                  disabled={scheme === 'http'}
                  value={field.value}
                  onChange={field.onChange}
                  options={[
                      { value: 'verify', label: t('pages.nodes.tlsVerify') },
                      { value: 'pin', label: t('pages.nodes.tlsPin') },
                      { value: 'skip', label: t('pages.nodes.tlsSkip') }
                  ]}
                />
              )}
            />
          </Field>

          {tlsVerifyMode === 'skip' && (
            <Alert variant="warning" title={t('pages.nodes.tlsSkipWarning')} />
          )}

          {tlsVerifyMode === 'pin' && (
            <Field label={t('pages.nodes.pinnedCert')} htmlFor="node-pin" hint={t('pages.nodes.pinnedCertHint')}>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="node-pin"
                  className="flex-1"
                  startIcon={<Fingerprint aria-hidden />}
                  placeholder={t('pages.nodes.pinnedCertPlaceholder')}
                  {...register('pinnedCertSha256')}
                />
                <Button
                  type="button"
                  variant="secondary"
                  loading={fetchingPin}
                  onClick={onFetchPin}
                  className="shrink-0"
                >
                  {t('pages.nodes.fetchPin')}
                </Button>
              </div>
            </Field>
          )}

          <Field label={t('pages.nodes.apiToken')} htmlFor="node-token" error={apiTokenError} hint={apiTokenError ? undefined : t('pages.nodes.apiTokenHint')}>
            <PasswordInput
              id="node-token"
              startIcon={<KeyRound aria-hidden />}
              placeholder={t('pages.nodes.apiTokenPlaceholder')}
              aria-invalid={!!errors.apiToken}
              {...register('apiToken', { required: 'pages.nodes.toasts.fillRequired' })}
            />
          </Field>

          <div className="flex flex-col gap-3">
            <Button type="button" variant="secondary" loading={testing} onClick={onTest} className="sm:self-start">
              {t('pages.nodes.testConnection')}
            </Button>
            {testResult && (
              <div className="w-full">
                {testResult.status === 'online' ? (
                  <Alert variant="success" title={t('pages.nodes.connectionOk', { ms: testResult.latencyMs })}>
                    {testResult.xrayVersion ? `Xray ${ testResult.xrayVersion }` : undefined}
                  </Alert>
                ) : (
                  <Alert variant="danger" title={t('pages.nodes.connectionFailed')}>
                    {testResult.error}
                  </Alert>
                )}
              </div>
            )}
          </div>
        </form>
      </Modal>
    </>
    );
}
