import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Input, Modal, Textarea } from '@/components/ui';

interface PromptModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  okText?: string;
  type?: 'input' | 'textarea';
  initialValue?: string;
  loading?: boolean;
  onConfirm: (value: string) => void;
}

export default function PromptModal({
    open,
    onClose,
    title,
    okText,
    type = 'input',
    initialValue = '',
    loading = false,
    onConfirm
}: PromptModalProps)
{
    const { t } = useTranslation();
    const [value, setValue] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() =>
    {
        if (open)
        {
            setValue(initialValue);
            setTimeout(() =>
            {
                if (type === 'textarea')
                {
                    textareaRef.current?.focus();
                }
                else
                {
                    inputRef.current?.focus();
                }
            }, 50);
        }
    }, [open, initialValue, type]);

    function onKeydown(e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>)
    {
        if (type !== 'textarea' && e.key === 'Enter')
        {
            e.preventDefault();
            onConfirm(value);
            return;
        }
        if (type === 'textarea' && e.ctrlKey && e.key.toLowerCase() === 's')
        {
            e.preventDefault();
            onConfirm(value);
        }
    }

    return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      closeOnOverlay={false}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button loading={loading} onClick={() => onConfirm(value)}>{okText ?? t('confirm')}</Button>
        </>
      }
    >
      {type === 'textarea' ? (
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={12}
          className="resize-y font-mono text-[13px]"
          onKeyDown={onKeydown}
        />
      ) : (
        <Input ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={onKeydown} />
      )}
    </Modal>
    );
}
