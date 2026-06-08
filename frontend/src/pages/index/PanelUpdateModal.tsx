import { useTranslation } from 'react-i18next';
import { CloudDownload } from 'lucide-react';
import axios from 'axios';

import { HttpUtil, PromiseUtil } from '@/utils';
import { Alert, Badge, Button, Modal, confirm } from '@/components/ui';

export interface PanelUpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
}

interface BusyEvent {
  busy: boolean;
  tip?: string;
}

interface PanelUpdateModalProps {
  open: boolean;
  info: PanelUpdateInfo;
  onClose: () => void;
  onBusy: (e: BusyEvent) => void;
}

export default function PanelUpdateModal({ open, info, onClose, onBusy }: PanelUpdateModalProps)
{
    const { t } = useTranslation();

    async function pollUntilBack(): Promise<boolean>
    {
        await PromiseUtil.sleep(5000);
        const deadline = Date.now() + 90_000;
        while (Date.now() < deadline)
        {
            try
            {
                const r = await axios.get('/panel/api/server/status', { timeout: 2000 });
                if (r?.data?.success)
                {
                    return true;
                }
            }
            catch
            {
                /* still restarting */
            }
            await PromiseUtil.sleep(2000);
        }
        return false;
    }

    async function updatePanel()
    {
        const ok = await confirm({
            title: t('pages.index.panelUpdateDialog'),
            description: t('pages.index.panelUpdateDialogDesc').replace('#version#', info.latestVersion || ''),
            confirmText: t('confirm'),
            cancelText: t('cancel')
        });
        if (!ok)
        {
            return;
        }
        const baseTip = t('pages.index.dontRefresh');
        const tip = info.latestVersion ? `${ baseTip } (${ info.latestVersion })` : baseTip;
        onClose();
        onBusy({ busy: true, tip });
        const result = await HttpUtil.post('/panel/api/server/updatePanel');
        if (!result?.success)
        {
            onBusy({ busy: false });
            return;
        }
        const back = await pollUntilBack();
        if (back)
        {
            await PromiseUtil.sleep(800);
        }
        window.location.reload();
    }

    return (
    <Modal open={open} title={t('pages.index.updatePanel')} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {info.updateAvailable && (
          <Alert variant="warning" title={t('pages.index.panelUpdateDesc')} />
        )}

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-sunken px-3 py-2.5">
            <span className="text-sm text-foreground">{t('pages.index.currentPanelVersion')}</span>
            <Badge variant="success">v{info.currentVersion || '?'}</Badge>
          </div>
          {info.updateAvailable ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-sunken px-3 py-2.5">
              <span className="text-sm text-foreground">{t('pages.index.latestPanelVersion')}</span>
              <Badge variant="primary">{info.latestVersion || '-'}</Badge>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-sunken px-3 py-2.5">
              <span className="text-sm text-foreground">{t('pages.index.panelUpToDate')}</span>
              <Badge variant="success">{t('pages.index.panelUpToDate')}</Badge>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button disabled={!info.updateAvailable} onClick={updatePanel}>
            <CloudDownload className="h-4 w-4" aria-hidden />
            {t('pages.index.updatePanel')}
          </Button>
        </div>
      </div>
    </Modal>
    );
}
