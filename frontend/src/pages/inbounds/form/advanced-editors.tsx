import { useEffect, useRef, useState } from 'react';

import { JsonEditor } from '@/components/form';
import {
    pruneEmpty,
    normalizeSniffing,
    normalizeClients,
    dropLegacyOptionalEmpties
} from '@/lib/xray/inbound-form-adapter';
import { useFormContext, useWatch } from '@/components/form/rhf';

// Sub-editor for one slice of the form (settings, streamSettings, sniffing).
// Holds a local text buffer so the user can type freely; on every keystroke we
// try to JSON.parse and forward the result to form state. Invalid JSON is held
// in the buffer until the next valid moment.
export function AdvancedSliceEditor({
    path,
    wrapKey,
    minHeight,
    maxHeight
}: {
  form?: unknown;
  path: string;
  wrapKey?: string;
  minHeight?: string;
  maxHeight?: string;
})
{
    const { getValues, setValue } = useFormContext();
    const serialize = (value: unknown): string =>
    {
        const inner = value ?? {};
        return JSON.stringify(wrapKey ? { [wrapKey]: inner } : inner, null, 2);
    };
    const watched = useWatch({ name: path });
    const lastEmitRef = useRef<string>('');
    const [text, setText] = useState(() =>
    {
        const initial = serialize(getValues(path));
        lastEmitRef.current = initial;
        return initial;
    });

    useEffect(() =>
    {
        const formStr = serialize(watched);
        if (formStr === lastEmitRef.current)
        {
            return;
        }
        setText(formStr);
        lastEmitRef.current = formStr;
    }, [watched, wrapKey]);

    return (
    <JsonEditor
      value={text}
      minHeight={minHeight}
      maxHeight={maxHeight}
      onChange={(next) =>
      {
          setText(next);
          try
          {
              const parsed = JSON.parse(next);
              const toWrite = wrapKey && parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                  ? (parsed as Record<string, unknown>)[wrapKey] ?? {}
                  : parsed;
              setValue(path, toWrite);
              lastEmitRef.current = JSON.stringify(wrapKey ? { [wrapKey]: toWrite } : toWrite, null, 2);
          }
          catch
          {
          // invalid JSON; keep buffer, don't push to form
          }
      }}
    />
    );
}

// The "All" editor shows the full inbound JSON in one editor: top-level
// connection fields plus the three nested sub-objects. Edits round-trip back to
// the form's slices.
export function AdvancedAllEditor({ streamEnabled }: { form?: unknown; streamEnabled: boolean })
{
    const { setValue } = useFormContext();
    const wListen = useWatch({ name: 'listen' });
    const wPort = useWatch({ name: 'port' });
    const wProtocol = useWatch({ name: 'protocol' });
    const wTag = useWatch({ name: 'tag' });
    const wSettings = useWatch({ name: 'settings' });
    const wSniffing = useWatch({ name: 'sniffing' });
    const wStream = useWatch({ name: 'streamSettings' });

    const serialize = () =>
    {
        const settingsView = (pruneEmpty(wSettings ?? {}) ?? {}) as Record<string, unknown>;
        if (typeof wProtocol === 'string' && Array.isArray(settingsView.clients))
        {
            settingsView.clients = normalizeClients(wProtocol, settingsView.clients);
        }
        const streamView = streamEnabled ? ((pruneEmpty(wStream ?? {}) ?? {}) as Record<string, unknown>) : undefined;
        dropLegacyOptionalEmpties(settingsView, streamView);
        const out: Record<string, unknown> = {
            listen: wListen ?? '',
            port: wPort ?? 0,
            protocol: wProtocol ?? '',
            tag: wTag ?? '',
            settings: settingsView,
            sniffing: normalizeSniffing(wSniffing as Parameters<typeof normalizeSniffing>[0])
        };
        if (streamView)
        {
            out.streamSettings = streamView;
        }
        return JSON.stringify(out, null, 2);
    };

    const lastEmitRef = useRef<string>('');
    const [text, setText] = useState(() =>
    {
        const initial = serialize();
        lastEmitRef.current = initial;
        return initial;
    });

    useEffect(() =>
    {
        const formStr = serialize();
        if (formStr === lastEmitRef.current)
        {
            return;
        }
        setText(formStr);
        lastEmitRef.current = formStr;
    }, [wListen, wPort, wProtocol, wTag, wSettings, wSniffing, wStream, streamEnabled]);

    return (
    <JsonEditor
      value={text}
      minHeight="340px"
      maxHeight="560px"
      onChange={(next) =>
      {
          setText(next);
          let parsed: Record<string, unknown>;
          try
          {
              parsed = JSON.parse(next) as Record<string, unknown>;
          }
          catch
          {
              return;
          }
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
          {
              return;
          }
          if (typeof parsed.listen === 'string')
          {
              setValue('listen', parsed.listen);
          }
          if (typeof parsed.port === 'number' && Number.isFinite(parsed.port))
          {
              setValue('port', parsed.port);
          }
          if (typeof parsed.protocol === 'string')
          {
              setValue('protocol', parsed.protocol);
          }
          if (typeof parsed.tag === 'string')
          {
              setValue('tag', parsed.tag);
          }
          if (parsed.settings && typeof parsed.settings === 'object')
          {
              setValue('settings', parsed.settings);
          }
          if (parsed.sniffing && typeof parsed.sniffing === 'object')
          {
              setValue('sniffing', parsed.sniffing);
          }
          if (streamEnabled && parsed.streamSettings && typeof parsed.streamSettings === 'object')
          {
              setValue('streamSettings', parsed.streamSettings);
          }
          lastEmitRef.current = next;
      }}
    />
    );
}
