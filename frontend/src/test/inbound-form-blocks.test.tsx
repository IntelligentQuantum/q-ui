import { describe, it, expect } from 'vitest';
import type { ReactNode } from 'react';
import { FormProvider, useForm } from 'react-hook-form';

import {
    ExternalProxyForm,
    GrpcForm,
    HttpUpgradeForm,
    KcpForm,
    RawForm,
    SockoptForm,
    WsForm,
    XhttpForm
} from '@/pages/inbounds/form/transport';
import { RealityForm, TlsForm } from '@/pages/inbounds/form/security';
import { renderWithProviders } from './test-utils';

// The inbound sub-forms were migrated to react-hook-form; render them inside an
// RHF FormProvider harness (the old AntD <Form> harness no longer applies) and
// smoke-test that each renders labelled fields without crashing.
function Harness({ children, defaultValues }: { children: ReactNode; defaultValues?: Record<string, unknown> })
{
    const methods = useForm({ defaultValues: defaultValues ?? {} });
    return <FormProvider {...methods}>{children}</FormProvider>;
}

function renderInForm(node: ReactNode, defaultValues?: Record<string, unknown>)
{
    return renderWithProviders(<Harness defaultValues={defaultValues}>{node}</Harness>);
}

function labelCount(): number
{
    return document.querySelectorAll('label').length;
}

const noop = () =>
{};

describe('inbound transport forms', () =>
{
    it('RawForm renders', () =>
    {
        renderInForm(<RawForm />);
        expect(labelCount()).toBeGreaterThan(0);
    });
    it('WsForm renders', () =>
    {
        renderInForm(<WsForm />);
        expect(labelCount()).toBeGreaterThan(0);
    });
    it('GrpcForm renders', () =>
    {
        renderInForm(<GrpcForm />);
        expect(labelCount()).toBeGreaterThan(0);
    });
    it('KcpForm renders', () =>
    {
        renderInForm(<KcpForm />);
        expect(labelCount()).toBeGreaterThan(0);
    });
    it('HttpUpgradeForm renders', () =>
    {
        renderInForm(<HttpUpgradeForm />);
        expect(labelCount()).toBeGreaterThan(0);
    });
    it('XhttpForm renders', () =>
    {
        renderInForm(<XhttpForm />);
        expect(labelCount()).toBeGreaterThan(0);
    });
    it('ExternalProxyForm renders (one TLS entry)', () =>
    {
        renderInForm(<ExternalProxyForm toggleExternalProxy={noop} />, {
            streamSettings: { externalProxy: [{ forceTls: 'tls', dest: '', port: 443, remark: '', sni: '', fingerprint: '', alpn: [] }] }
        });
        expect(labelCount()).toBeGreaterThan(0);
    });
    it('SockoptForm renders (enabled + happy eyeballs)', () =>
    {
        renderInForm(<SockoptForm toggleSockopt={noop} />, {
            streamSettings: { sockopt: { happyEyeballs: {} } }
        });
        expect(labelCount()).toBeGreaterThan(0);
    });
});

describe('inbound security forms', () =>
{
    it('TlsForm renders', () =>
    {
        renderInForm(
      <TlsForm
        saving={false}
        setCertFromPanel={noop}
        clearCertFiles={noop}
        generateRandomPinHash={noop}
        getNewEchCert={noop}
        clearEchCert={noop}
      />,
      { streamSettings: { tlsSettings: { certificates: [{ useFile: true }] } } }
        );
        expect(labelCount()).toBeGreaterThan(0);
    });
    it('RealityForm renders', () =>
    {
        renderInForm(
      <RealityForm
        saving={false}
        randomizeRealityTarget={noop}
        randomizeShortIds={noop}
        genRealityKeypair={noop}
        clearRealityKeypair={noop}
        genMldsa65={noop}
        clearMldsa65={noop}
      />
        );
        expect(labelCount()).toBeGreaterThan(0);
    });
});
