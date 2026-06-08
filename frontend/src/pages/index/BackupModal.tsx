import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Upload } from 'lucide-react';

import { HttpUtil, PromiseUtil } from '@/utils';
import { Button, Modal } from '@/components/ui';

interface BusyEvent {
  busy: boolean;
  tip?: string;
}

interface BackupModalProps {
  open: boolean;
  basePath: string;
  onClose: () => void;
  onBusy: (e: BusyEvent) => void;
}

export default function BackupModal({ open, basePath: _basePath, onClose, onBusy }: BackupModalProps)
{
    const { t } = useTranslation();
    const isPostgres = window.Q_UI_DB_TYPE === 'postgres';

    function exportDb()
    {
        window.location.href = (window.Q_UI_BASE_PATH || '') + 'panel/api/server/getDb';
    }

    function exportMigration()
    {
        window.location.href = (window.Q_UI_BASE_PATH || '') + 'panel/api/server/getMigration';
    }

    function importDb()
    {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = isPostgres ? '.dump' : '.db';
        fileInput.addEventListener('change', async (e) =>
        {
            const dbFile = (e.target as HTMLInputElement).files?.[0];
            if (!dbFile)
            {
                return;
            }

            const formData = new FormData();
            formData.append('db', dbFile);

            onClose();
            onBusy({ busy: true, tip: `${ t('pages.index.importDatabase') }…` });

            const upload = await HttpUtil.post('/panel/api/server/importDB', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (!upload?.success)
            {
                onBusy({ busy: false });
                return;
            }

            onBusy({ busy: true, tip: `${ t('pages.settings.restartPanel') }…` });
            const restart = await HttpUtil.post('/panel/setting/restartPanel');
            if (restart?.success)
            {
                await PromiseUtil.sleep(5000);
                window.location.reload();
            }
            else
            {
                onBusy({ busy: false });
            }
        });
        fileInput.click();
    }

    function BackupItem({
        title,
        description,
        onAction,
        actionLabel,
        icon
    }: {
    title: string;
    description: string;
    onAction: () => void;
    actionLabel: string;
    icon: ReactNode;
  })
    {
        return (
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface-sunken p-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="text-sm font-medium text-foreground">{title}</div>
          <div className="text-xs text-muted-foreground">{description}</div>
        </div>
        <Button aria-label={actionLabel} size="icon" onClick={onAction} className="shrink-0">
          {icon}
        </Button>
      </div>
        );
    }

    return (
    <Modal open={open} title={t('pages.index.backupTitle')} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {isPostgres && (
          <p className="text-sm text-muted-foreground">{t('pages.index.backupPostgresNote')}</p>
        )}

        <BackupItem
          title={t('pages.index.exportDatabase')}
          description={isPostgres ? t('pages.index.exportDatabasePgDesc') : t('pages.index.exportDatabaseDesc')}
          onAction={exportDb}
          actionLabel={t('download')}
          icon={<Download className="h-4 w-4" aria-hidden />}
        />

        <BackupItem
          title={t('pages.index.migrationDownload')}
          description={isPostgres ? t('pages.index.migrationDownloadPgDesc') : t('pages.index.migrationDownloadDesc')}
          onAction={exportMigration}
          actionLabel={t('download')}
          icon={<Download className="h-4 w-4" aria-hidden />}
        />

        <BackupItem
          title={t('pages.index.importDatabase')}
          description={isPostgres ? t('pages.index.importDatabasePgDesc') : t('pages.index.importDatabaseDesc')}
          onAction={importDb}
          actionLabel={t('pages.index.importDatabase')}
          icon={<Upload className="h-4 w-4" aria-hidden />}
        />
      </div>
    </Modal>
    );
}
