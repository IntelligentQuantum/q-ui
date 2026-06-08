import { Copy, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button, Modal, Textarea } from '@/components/ui';
import { getMessage } from '@/utils/messageBus';
import { ClipboardManager, FileManager } from '@/utils';

interface TextModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  content: string;
  fileName?: string;
}

export default function TextModal({ open, onClose, title, content, fileName = '' }: TextModalProps)
{
    const { t } = useTranslation();

    async function copy()
    {
        const ok = await ClipboardManager.copyText(content || '');
        if (ok)
        {
            getMessage().success(t('copied'));
            onClose();
        }
    }

    function download()
    {
        if (!fileName)
        {
            return;
        }
        FileManager.downloadTextFile(content, fileName);
    }

    return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={(
        <>
          {fileName && (
            <Button variant="secondary" onClick={download}>
              <Download className="h-4 w-4" aria-hidden />
              {fileName}
            </Button>
          )}
          <Button onClick={copy}>
            <Copy className="h-4 w-4" aria-hidden />
            {t('copy')}
          </Button>
        </>
      )}
    >
      <Textarea
        value={content}
        readOnly
        rows={12}
        className="max-h-[60vh] resize-none overflow-y-auto font-mono text-xs"
      />
    </Modal>
    );
}
