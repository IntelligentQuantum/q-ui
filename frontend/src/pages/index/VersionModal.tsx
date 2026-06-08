import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, RefreshCw } from 'lucide-react';

import { HttpUtil } from '@/utils';
import type { Status } from '@/models/status';
import {
    Alert,
    Badge,
    Button,
    Modal,
    Spinner,
    Tooltip,
    cn,
    confirm
} from '@/components/ui';
import CustomGeoSection from './CustomGeoSection';

interface BusyEvent {
  busy: boolean;
  tip?: string;
}

interface VersionModalProps {
  open: boolean;
  status: Status;
  onClose: () => void;
  onBusy: (e: BusyEvent) => void;
}

const GEOFILES = [
    'geosite.dat',
    'geoip.dat',
    'geosite_IR.dat',
    'geoip_IR.dat',
    'geosite_RU.dat',
    'geoip_RU.dat'
];

function AccordionSection({
    label,
    expanded,
    onToggle,
    children
}: {
  label: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
})
{
    return (
    <div className="overflow-hidden rounded-lg border border-border">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 bg-surface-sunken px-3 py-2.5 text-start text-sm font-medium text-foreground transition-colors hover:bg-foreground/[0.04]"
      >
        {label}
        <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', expanded && 'rotate-180')} aria-hidden />
      </button>
      {expanded && <div className="p-3">{children}</div>}
    </div>
    );
}

export default function VersionModal({ open, status, onClose, onBusy }: VersionModalProps)
{
    const { t } = useTranslation();
    const [activeKey, setActiveKey] = useState('1');
    const [versions, setVersions] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchVersions = useCallback(async () =>
    {
        setLoading(true);
        try
        {
            const msg = await HttpUtil.get<string[]>('/panel/api/server/getXrayVersion');
            if (msg?.success)
            {
                setVersions(msg.obj || []);
            }
        }
        finally
        {
            setLoading(false);
        }
    }, []);

    useEffect(() =>
    {
        if (open)
        {
            fetchVersions();
        }
    }, [open, fetchVersions]);

    async function switchXrayVersion(version: string)
    {
        const ok = await confirm({
            title: t('pages.index.xraySwitchVersionDialog'),
            description: t('pages.index.xraySwitchVersionDialogDesc').replace('#version#', version),
            confirmText: t('confirm'),
            cancelText: t('cancel')
        });
        if (!ok)
        {
            return;
        }
        onClose();
        onBusy({ busy: true, tip: t('pages.index.dontRefresh') });
        try
        {
            await HttpUtil.post(`/panel/api/server/installXray/${ version }`);
        }
        finally
        {
            onBusy({ busy: false });
        }
    }

    async function updateGeofile(fileName: string)
    {
        const isSingle = !!fileName;
        const ok = await confirm({
            title: t('pages.index.geofileUpdateDialog'),
            description: isSingle
                ? t('pages.index.geofileUpdateDialogDesc').replace('#filename#', fileName)
                : t('pages.index.geofilesUpdateDialogDesc'),
            confirmText: t('confirm'),
            cancelText: t('cancel')
        });
        if (!ok)
        {
            return;
        }
        onClose();
        onBusy({ busy: true, tip: t('pages.index.dontRefresh') });
        const url = isSingle
            ? `/panel/api/server/updateGeofile/${ fileName }`
            : '/panel/api/server/updateGeofile';
        try
        {
            await HttpUtil.post(url);
        }
        finally
        {
            onBusy({ busy: false });
        }
    }

    // Accordion: only one section open at a time.
    const toggle = (key: string) => setActiveKey((prev) => (prev === key ? '' : key));

    return (
    <Modal open={open} title={t('pages.index.xrayUpdates')} onClose={onClose}>
      <div className="relative flex flex-col gap-3">
        {loading && (
          <div className="absolute inset-0 z-10 grid place-items-center rounded-lg bg-surface-raised/60">
            <Spinner />
          </div>
        )}

        <AccordionSection label="Xray" expanded={activeKey === '1'} onToggle={() => toggle('1')}>
          <Alert variant="warning" title={t('pages.index.xraySwitchClickDesk')} className="mb-3" />
          <div className="flex flex-col gap-1.5">
            {versions.map((version, index) =>
            {
                const checked = version === `v${ status?.xray?.version }`;
                return (
                <button
                  key={version}
                  type="button"
                  onClick={() => switchXrayVersion(version)}
                  className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-start transition-colors hover:bg-foreground/[0.04]"
                >
                  <Badge variant={index % 2 === 0 ? 'primary' : 'success'}>{version}</Badge>
                  <span
                    className={cn(
                        'grid h-4 w-4 shrink-0 place-items-center rounded-full border',
                        checked ? 'border-accent' : 'border-border-strong'
                    )}
                    aria-hidden
                  >
                    {checked && <span className="h-2 w-2 rounded-full bg-accent" />}
                  </span>
                </button>
                );
            })}
          </div>
        </AccordionSection>

        <AccordionSection label="Geofiles" expanded={activeKey === '2'} onToggle={() => toggle('2')}>
          <div className="flex flex-col gap-1.5">
            {GEOFILES.map((file, index) => (
              <div key={file} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5">
                <Badge variant={index % 2 === 0 ? 'primary' : 'success'}>{file}</Badge>
                <Tooltip content={t('update')}>
                  <Button
                    aria-label={t('update')}
                    variant="ghost"
                    size="icon"
                    onClick={() => updateGeofile(file)}
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden />
                  </Button>
                </Tooltip>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-end">
            <Button variant="secondary" onClick={() => updateGeofile('')}>
              {t('pages.index.geofilesUpdateAll')}
            </Button>
          </div>
        </AccordionSection>

        <AccordionSection
          label={t('pages.index.customGeoTitle')}
          expanded={activeKey === '3'}
          onToggle={() => toggle('3')}
        >
          <CustomGeoSection active={activeKey === '3'} />
        </AccordionSection>
      </div>
    </Modal>
    );
}
