import axios from 'axios';
import type { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import i18next from 'i18next';
import { getMessage } from './messageBus';

interface RespEnvelope { success?: unknown; msg?: unknown; obj?: unknown }

export class Msg<T = unknown>
{
    public success: boolean;
    public msg: string;
    public obj: T | null;

    constructor(success: boolean = false, msg: string = '', obj: T | null = null)
    {
        this.success = success;
        this.msg = msg;
        this.obj = obj;
    }
}

export interface HttpOptions extends AxiosRequestConfig {
  silent?: boolean;
}

export interface HttpModal {
  loading: (state: boolean) => void;
  close: () => void;
}

export class HttpUtil
{
    public static _handleMsg(msg: unknown): void
    {
        if (!(msg instanceof Msg) || msg.msg === '')
        {
            return;
        }
        const messageType = msg.success ? 'success' : 'error';
        getMessage()[messageType](msg.msg);
        if (
            msg.success &&
      msg.obj &&
      typeof msg.obj === 'object' &&
      (msg.obj as { nodePending?: unknown }).nodePending === true
        )
        {
            getMessage().warning(i18next.t('pages.inbounds.toasts.savedNodeOfflineWillSync'));
        }
    }

    public static _respToMsg(resp: AxiosResponse | undefined): Msg
    {
        if (!resp || !resp.data)
        {
            return new Msg(false, 'No response data');
        }
        const { data } = resp;
        if (data == null)
        {
            return new Msg(true);
        }
        if (typeof data === 'object' && 'success' in (data as object))
        {
            const d = data as RespEnvelope;
            return new Msg(Boolean(d.success), typeof d.msg === 'string' ? d.msg : '', d.obj ?? null);
        }
        return typeof data === 'object' ? (data as Msg) : new Msg(false, 'unknown data:', data);
    }

    public static async get<T = unknown>(url: string, params?: unknown, options: HttpOptions = {}): Promise<Msg<T>>
    {
        const { silent, ...axiosOpts } = options;
        try
        {
            const resp = await axios.get(url, { params, ...axiosOpts });
            const msg = this._respToMsg(resp) as Msg<T>;
            if (!silent)
            {
                this._handleMsg(msg);
            }
            return msg;
        }
        catch (error)
        {
            console.error('GET request failed:', error);
            const err = error as AxiosError<{ message?: string }>;
            const errorMsg = new Msg<T>(false, err.response?.data?.message || err.message || 'Request failed');
            if (!silent)
            {
                this._handleMsg(errorMsg);
            }
            return errorMsg;
        }
    }

    public static async post<T = unknown>(url: string, data?: unknown, options: HttpOptions = {}): Promise<Msg<T>>
    {
        const { silent, ...axiosOpts } = options;
        try
        {
            const resp = await axios.post(url, data, axiosOpts);
            const msg = this._respToMsg(resp) as Msg<T>;
            if (!silent)
            {
                this._handleMsg(msg);
            }
            return msg;
        }
        catch (error)
        {
            console.error('POST request failed:', error);
            const err = error as AxiosError<{ message?: string }>;
            const errorMsg = new Msg<T>(false, err.response?.data?.message || err.message || 'Request failed');
            if (!silent)
            {
                this._handleMsg(errorMsg);
            }
            return errorMsg;
        }
    }

    public static async postWithModal<T = unknown>(url: string, data?: unknown, modal?: HttpModal | null): Promise<Msg<T>>
    {
        if (modal)
        {
            modal.loading(true);
        }
        const msg = await this.post<T>(url, data);
        if (modal)
        {
            modal.loading(false);
            if (msg instanceof Msg && msg.success)
            {
                modal.close();
            }
        }
        return msg;
    }
}

export function applyDocumentTitle(): void
{
    const host = window.location.hostname;
    if (!host)
    {
        return;
    }
    const current = document.title.trim();
    document.title = current ? `${ host } - ${ current }` : host;
}

export class PromiseUtil
{
    public static async sleep(timeout: number): Promise<void>
    {
        await new Promise<void>((resolve) =>
        {
            setTimeout(resolve, timeout);
        });
    }
}

export interface RandomSeqOptions {
  type?: 'default' | 'hex';
  hasNumbers?: boolean;
  hasLowercase?: boolean;
  hasUppercase?: boolean;
}

export class RandomUtil
{
    public static getSeq({ type = 'default', hasNumbers = true, hasLowercase = true, hasUppercase = true }: RandomSeqOptions = {}): string
    {
        let seq = '';

        switch (type)
        {
            case 'hex':
                seq += '0123456789abcdef';
                break;
            default:
                if (hasNumbers)
                {
                    seq += '0123456789';
                }
                if (hasLowercase)
                {
                    seq += 'abcdefghijklmnopqrstuvwxyz';
                }
                if (hasUppercase)
                {
                    seq += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
                }
                break;
        }

        return seq;
    }

    public static randomInteger(min: number, max: number): number
    {
        const range = max - min + 1;
        const randomBuffer = new Uint32Array(1);
        window.crypto.getRandomValues(randomBuffer);
        return Math.floor((randomBuffer[0] / (0xFFFFFFFF + 1)) * range) + min;
    }

    public static randomSeq(count: number, options: RandomSeqOptions = {}): string
    {
        const seq = this.getSeq(options);
        const seqLength = seq.length;
        const randomValues = new Uint32Array(count);
        window.crypto.getRandomValues(randomValues);
        return Array.from(randomValues, (v) => seq[v % seqLength]).join('');
    }

    public static randomShortIds(): string
    {
        const lengths = [2, 4, 6, 8, 10, 12, 14, 16].sort(() => Math.random() - 0.5);
        return lengths.map((len) => this.randomSeq(len, { type: 'hex' })).join(',');
    }

    public static randomLowerAndNum(len: number): string
    {
        return this.randomSeq(len, { hasUppercase: false });
    }

    public static randomUUID(): string
    {
        if (window.location.protocol === 'https:')
        {
            return window.crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) =>
        {
            const randomValues = new Uint8Array(1);
            window.crypto.getRandomValues(randomValues);
            const randomValue = randomValues[0] % 16;
            const calculatedValue = c === 'x' ? randomValue : (randomValue & 0x3) | 0x8;
            return calculatedValue.toString(16);
        });
    }

    public static randomShadowsocksPassword(method: string = '2022-blake3-aes-256-gcm'): string
    {
        let length = 32;
        if (method === '2022-blake3-aes-128-gcm')
        {
            length = 16;
        }
        const array = new Uint8Array(length);
        window.crypto.getRandomValues(array);
        return Base64.alternativeEncode(String.fromCharCode(...array));
    }

    public static randomBase64(length: number = 16): string
    {
        const array = new Uint8Array(length);
        window.crypto.getRandomValues(array);
        return Base64.alternativeEncode(String.fromCharCode(...array));
    }

    public static randomBase32String(length: number = 16): string
    {
        const array = new Uint8Array(length);
        window.crypto.getRandomValues(array);

        const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        let result = '';
        let bits = 0;
        let buffer = 0;

        for (let i = 0; i < array.length; i++)
        {
            buffer = (buffer << 8) | array[i];
            bits += 8;

            while (bits >= 5)
            {
                bits -= 5;
                result += base32Chars[(buffer >>> bits) & 0x1F];
            }
        }

        if (bits > 0)
        {
            result += base32Chars[(buffer << (5 - bits)) & 0x1F];
        }

        return result;
    }
}

type AnyRecord = Record<string, unknown>;

export class ObjectUtil
{
    public static getPropIgnoreCase(obj: AnyRecord, prop: string): unknown
    {
        for (const name in obj)
        {
            if (!Object.prototype.hasOwnProperty.call(obj, name))
            {
                continue;
            }
            if (name.toLowerCase() === prop.toLowerCase())
            {
                return obj[name];
            }
        }
        return undefined;
    }

    public static deepSearch(obj: unknown, key: string): boolean
    {
        if (obj instanceof Array)
        {
            for (let i = 0; i < obj.length; ++i)
            {
                if (this.deepSearch(obj[i], key))
                {
                    return true;
                }
            }
        }
        else if (obj instanceof Object)
        {
            const rec = obj as AnyRecord;
            for (const name in rec)
            {
                if (!Object.prototype.hasOwnProperty.call(rec, name))
                {
                    continue;
                }
                if (this.deepSearch(rec[name], key))
                {
                    return true;
                }
            }
        }
        else
        {
            return this.isEmpty(obj) ? false : String(obj).toLowerCase().indexOf(key.toLowerCase()) >= 0;
        }
        return false;
    }

    public static isEmpty(obj: unknown): boolean
    {
        return obj === null || obj === undefined || obj === '';
    }

    public static isArrEmpty(arr: unknown): boolean
    {
        return !Array.isArray(arr) || arr.length === 0;
    }

    public static copyArr<T>(dest: T[], src: T[]): void
    {
        dest.splice(0);
        for (const item of src)
        {
            dest.push(item);
        }
    }

    public static clone<T>(obj: T): T
    {
        if (obj instanceof Array)
        {
            const newArr: unknown[] = [];
            this.copyArr(newArr, obj);
            return newArr as unknown as T;
        }
        if (obj instanceof Object)
        {
            const newObj: AnyRecord = {};
            const rec = obj as unknown as AnyRecord;
            for (const key of Object.keys(rec))
            {
                newObj[key] = rec[key];
            }
            return newObj as unknown as T;
        }
        return obj;
    }

    public static deepClone<T>(obj: T): T
    {
        if (obj instanceof Array)
        {
            const newArr: unknown[] = [];
            for (const item of obj)
            {
                newArr.push(this.deepClone(item));
            }
            return newArr as unknown as T;
        }
        if (obj instanceof Object)
        {
            const newObj: AnyRecord = {};
            const rec = obj as unknown as AnyRecord;
            for (const key of Object.keys(rec))
            {
                newObj[key] = this.deepClone(rec[key]);
            }
            return newObj as unknown as T;
        }
        return obj;
    }

    public static cloneProps(dest: object, src: object, ...ignoreProps: string[]): void
    {
        if (dest == null || src == null)
        {
            return;
        }
        const ignoreEmpty = this.isArrEmpty(ignoreProps);
        const d = dest as AnyRecord;
        const s = src as AnyRecord;
        for (const key of Object.keys(s))
        {
            if (!Object.prototype.hasOwnProperty.call(s, key))
            {
                continue;
            }
            if (!Object.prototype.hasOwnProperty.call(d, key))
            {
                continue;
            }
            if (s[key] === undefined)
            {
                continue;
            }
            if (ignoreEmpty)
            {
                d[key] = s[key];
            }
            else
            {
                let ignore = false;
                for (let i = 0; i < ignoreProps.length; ++i)
                {
                    if (key === ignoreProps[i])
                    {
                        ignore = true;
                        break;
                    }
                }
                if (!ignore)
                {
                    d[key] = s[key];
                }
            }
        }
    }

    public static delProps(obj: object, ...props: string[]): void
    {
        const o = obj as AnyRecord;
        for (const prop of props)
        {
            if (prop in o)
            {
                delete o[prop];
            }
        }
    }

    public static execute(func: unknown, ...args: unknown[]): void
    {
        if (!this.isEmpty(func) && typeof func === 'function')
        {
            (func as (...a: unknown[]) => unknown)(...args);
        }
    }

    public static orDefault<T>(obj: T | null | undefined, defaultValue: T): T
    {
        if (obj == null)
        {
            return defaultValue;
        }
        return obj;
    }

    public static equals(a: unknown, b: unknown): boolean
    {
        if (a == null || b == null || typeof a !== 'object' || typeof b !== 'object')
        {
            return a === b;
        }
        const ra = a as AnyRecord;
        const rb = b as AnyRecord;
        const aKeys = Object.keys(ra);
        const bKeys = Object.keys(rb);
        if (aKeys.length !== bKeys.length)
        {
            return false;
        }
        for (const key of aKeys)
        {
            if (!Object.prototype.hasOwnProperty.call(rb, key))
            {
                return false;
            }
            if (ra[key] !== rb[key])
            {
                return false;
            }
        }
        return true;
    }
}

export class Wireguard
{
    public static gf(init?: ArrayLike<number>): Float64Array
    {
        const r = new Float64Array(16);
        if (init)
        {
            for (let i = 0; i < init.length; ++i)
            {
                r[i] = init[i];
            }
        }
        return r;
    }

    public static pack(o: Uint8Array, n: Float64Array): void
    {
        let b: number;
        const m = this.gf();
        const t = this.gf();
        for (let i = 0; i < 16; ++i)
        {
            t[i] = n[i];
        }
        this.carry(t);
        this.carry(t);
        this.carry(t);
        for (let j = 0; j < 2; ++j)
        {
            m[0] = t[0] - 0xffed;
            for (let i = 1; i < 15; ++i)
            {
                m[i] = t[i] - 0xffff - ((m[i - 1] >> 16) & 1);
                m[i - 1] &= 0xffff;
            }
            m[15] = t[15] - 0x7fff - ((m[14] >> 16) & 1);
            b = (m[15] >> 16) & 1;
            m[14] &= 0xffff;
            this.cswap(t, m, 1 - b);
        }
        for (let i = 0; i < 16; ++i)
        {
            o[2 * i] = t[i] & 0xff;
            o[2 * i + 1] = t[i] >> 8;
        }
    }

    public static carry(o: Float64Array): void
    {
        for (let i = 0; i < 16; ++i)
        {
            o[(i + 1) % 16] += (i < 15 ? 1 : 38) * Math.floor(o[i] / 65536);
            o[i] &= 0xffff;
        }
    }

    public static cswap(p: Float64Array, q: Float64Array, b: number): void
    {
        const c = ~(b - 1);
        let t: number;
        for (let i = 0; i < 16; ++i)
        {
            t = c & (p[i] ^ q[i]);
            p[i] ^= t;
            q[i] ^= t;
        }
    }

    public static add(o: Float64Array, a: Float64Array, b: Float64Array): void
    {
        for (let i = 0; i < 16; ++i)
        {
            o[i] = (a[i] + b[i]) | 0;
        }
    }

    public static subtract(o: Float64Array, a: Float64Array, b: Float64Array): void
    {
        for (let i = 0; i < 16; ++i)
        {
            o[i] = (a[i] - b[i]) | 0;
        }
    }

    public static multmod(o: Float64Array, a: Float64Array, b: Float64Array): void
    {
        const t = new Float64Array(31);
        for (let i = 0; i < 16; ++i)
        {
            for (let j = 0; j < 16; ++j)
            {
                t[i + j] += a[i] * b[j];
            }
        }
        for (let i = 0; i < 15; ++i)
        {
            t[i] += 38 * t[i + 16];
        }
        for (let i = 0; i < 16; ++i)
        {
            o[i] = t[i];
        }
        this.carry(o);
        this.carry(o);
    }

    public static invert(o: Float64Array, i: Float64Array): void
    {
        const c = this.gf();
        for (let a = 0; a < 16; ++a)
        {
            c[a] = i[a];
        }
        for (let a = 253; a >= 0; --a)
        {
            this.multmod(c, c, c);
            if (a !== 2 && a !== 4)
            {
                this.multmod(c, c, i);
            }
        }
        for (let a = 0; a < 16; ++a)
        {
            o[a] = c[a];
        }
    }

    public static clamp(z: Uint8Array): void
    {
        z[31] = (z[31] & 127) | 64;
        z[0] &= 248;
    }

    public static generatePublicKey(privateKey: Uint8Array): Uint8Array
    {
        let r: number;
        const z = new Uint8Array(32);
        const a = this.gf([1]);
        const b = this.gf([9]);
        const c = this.gf();
        const d = this.gf([1]);
        const e = this.gf();
        const f = this.gf();
        const _121665 = this.gf([0xdb41, 1]);
        const _9 = this.gf([9]);
        for (let i = 0; i < 32; ++i)
        {
            z[i] = privateKey[i];
        }
        this.clamp(z);
        for (let i = 254; i >= 0; --i)
        {
            r = (z[i >>> 3] >>> (i & 7)) & 1;
            this.cswap(a, b, r);
            this.cswap(c, d, r);
            this.add(e, a, c);
            this.subtract(a, a, c);
            this.add(c, b, d);
            this.subtract(b, b, d);
            this.multmod(d, e, e);
            this.multmod(f, a, a);
            this.multmod(a, c, a);
            this.multmod(c, b, e);
            this.add(e, a, c);
            this.subtract(a, a, c);
            this.multmod(b, a, a);
            this.subtract(c, d, f);
            this.multmod(a, c, _121665);
            this.add(a, a, d);
            this.multmod(c, c, a);
            this.multmod(a, d, f);
            this.multmod(d, b, _9);
            this.multmod(b, e, e);
            this.cswap(a, b, r);
            this.cswap(c, d, r);
        }
        this.invert(c, c);
        this.multmod(a, a, c);
        this.pack(z, a);
        return z;
    }

    public static generatePresharedKey(): Uint8Array
    {
        const privateKey = new Uint8Array(32);
        window.crypto.getRandomValues(privateKey);
        return privateKey;
    }

    public static generatePrivateKey(): Uint8Array
    {
        const privateKey = this.generatePresharedKey();
        this.clamp(privateKey);
        return privateKey;
    }

    public static encodeBase64(dest: Uint8Array, src: Uint8Array): void
    {
        const input = Uint8Array.from([
            (src[0] >> 2) & 63,
            ((src[0] << 4) | (src[1] >> 4)) & 63,
            ((src[1] << 2) | (src[2] >> 6)) & 63,
            src[2] & 63
        ]);
        for (let i = 0; i < 4; ++i)
        {
            dest[i] = input[i] + 65 +
        (((25 - input[i]) >> 8) & 6) -
        (((51 - input[i]) >> 8) & 75) -
        (((61 - input[i]) >> 8) & 15) +
        (((62 - input[i]) >> 8) & 3);
        }
    }

    public static keyToBase64(key: Uint8Array): string
    {
        let i: number;
        const base64 = new Uint8Array(44);
        for (i = 0; i < 32 / 3; ++i)
        {
            this.encodeBase64(base64.subarray(i * 4), key.subarray(i * 3));
        }
        this.encodeBase64(base64.subarray(i * 4), Uint8Array.from([key[i * 3 + 0], key[i * 3 + 1], 0]));
        base64[43] = 61;
        return String.fromCharCode.apply(null, Array.from(base64));
    }

    public static keyFromBase64(encoded: string): Uint8Array
    {
        const binaryStr = atob(encoded);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++)
        {
            bytes[i] = binaryStr.charCodeAt(i);
        }
        return bytes;
    }

    public static generateKeypair(secretKey: string = ''): { publicKey: string; privateKey: string }
    {
        const privateKey = secretKey.length > 0 ? this.keyFromBase64(secretKey) : this.generatePrivateKey();
        const publicKey = this.generatePublicKey(privateKey);
        return {
            publicKey: this.keyToBase64(publicKey),
            privateKey: secretKey.length > 0 ? secretKey : this.keyToBase64(privateKey)
        };
    }
}

export class ClipboardManager
{
    public static async copyText(content: unknown = ''): Promise<boolean>
    {
        const text = String(content ?? '');
        if (navigator.clipboard && window.isSecureContext)
        {
            try
            {
                await navigator.clipboard.writeText(text);
                return true;
            }
            catch
            {
                // fall through to legacy copy
            }
        }
        return ClipboardManager._legacyCopy(text);
    }

    public static _legacyCopy(text: string): boolean
    {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.setAttribute('aria-hidden', 'true');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        textarea.style.opacity = '1';

        const active = document.activeElement as HTMLElement | null;
        const host = (active && active !== document.body && active.parentElement)
            ? active.parentElement
            : document.body;
        host.appendChild(textarea);

        const sel0 = document.getSelection();
        const prevSelection = sel0 && sel0.rangeCount ? sel0.getRangeAt(0) : null;

        let ok = false;
        try
        {
            textarea.focus({ preventScroll: true });
            textarea.select();
            textarea.setSelectionRange(0, text.length);
            // Routed through a dynamic lookup so the @deprecated tag on
            // Document.execCommand doesn't surface here. execCommand is the
            // only copy path that works in insecure contexts (HTTP panels
            // behind IP/localhost) — reached only after navigator.clipboard
            // fails or is unavailable.
            const exec = (document as unknown as Record<string, unknown>)['execCommand'];
            if (typeof exec === 'function')
            {
                ok = (exec as (cmd: string) => boolean).call(document, 'copy');
            }
        }
        catch
        {
            // copy unsupported; ignore
        }

        host.removeChild(textarea);
        if (active && typeof active.focus === 'function')
        {
            try
            {
                active.focus({ preventScroll: true });
            }
            catch
            {
                // focus restore is best-effort
            }
        }
        if (prevSelection)
        {
            const sel = document.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(prevSelection);
        }
        return ok;
    }
}

export class Base64
{
    public static encode(content: string = '', safe: boolean = false): string
    {
        if (safe)
        {
            return Base64.encode(content)
                .replace(/\+/g, '-')
                .replace(/=/g, '')
                .replace(/\//g, '_');
        }
        return window.btoa(String.fromCharCode(...new TextEncoder().encode(content)));
    }

    public static alternativeEncode(content: string): string
    {
        return window.btoa(content);
    }

    public static decode(content: string = ''): string
    {
        return new TextDecoder().decode(
            Uint8Array.from(window.atob(content), (c) => c.charCodeAt(0))
        );
    }
}

export class SizeFormatter
{
    public static readonly ONE_KB = 1024;
    public static readonly ONE_MB = SizeFormatter.ONE_KB * 1024;
    public static readonly ONE_GB = SizeFormatter.ONE_MB * 1024;
    public static readonly ONE_TB = SizeFormatter.ONE_GB * 1024;
    public static readonly ONE_PB = SizeFormatter.ONE_TB * 1024;

    public static sizeFormat(size: number | null | undefined): string
    {
        if (size == null || !Number.isFinite(size) || size <= 0)
        {
            return '0 B';
        }
        if (size < SizeFormatter.ONE_KB)
        {
            return size.toFixed(0) + ' B';
        }
        if (size < SizeFormatter.ONE_MB)
        {
            return (size / SizeFormatter.ONE_KB).toFixed(2) + ' KB';
        }
        if (size < SizeFormatter.ONE_GB)
        {
            return (size / SizeFormatter.ONE_MB).toFixed(2) + ' MB';
        }
        if (size < SizeFormatter.ONE_TB)
        {
            return (size / SizeFormatter.ONE_GB).toFixed(2) + ' GB';
        }
        if (size < SizeFormatter.ONE_PB)
        {
            return (size / SizeFormatter.ONE_TB).toFixed(2) + ' TB';
        }
        return (size / SizeFormatter.ONE_PB).toFixed(2) + ' PB';
    }

    public static speedFormat(bps: number | null | undefined): string
    {
        return SizeFormatter.sizeFormat(bps) + '/s';
    }
}

export class CPUFormatter
{
    public static cpuSpeedFormat(speed: number): string
    {
        return speed > 1000 ? (speed / 1000).toFixed(2) + ' GHz' : speed.toFixed(2) + ' MHz';
    }

    public static cpuCoreFormat(cores: number): string
    {
        return cores === 1 ? '1 Core' : cores + ' Cores';
    }
}

export class TimeFormatter
{
    public static formatSecond(second: number): string
    {
        if (second < 60)
        {
            return second.toFixed(0) + 's';
        }
        if (second < 3600)
        {
            return (second / 60).toFixed(0) + 'm';
        }
        if (second < 3600 * 24)
        {
            return (second / 3600).toFixed(0) + 'h';
        }
        const day = Math.floor(second / 3600 / 24);
        const remain = Number(((second / 3600) - (day * 24)).toFixed(0));
        return day + 'd' + (remain > 0 ? ' ' + remain + 'h' : '');
    }
}

export class NumberFormatter
{
    public static addZero(num: number): string | number
    {
        return num < 10 ? '0' + num : num;
    }

    public static toFixed(num: number, n: number): number
    {
        const m = Math.pow(10, n);
        return Math.floor(num * m) / m;
    }
}

export class Utils
{
    public static debounce<A extends unknown[]>(fn: (...args: A) => unknown, delay: number): (...args: A) => void
    {
        let timeoutID: ReturnType<typeof setTimeout> | null = null;
        return function (this: unknown, ...args: A)
        {
            if (timeoutID !== null)
            {
                clearTimeout(timeoutID);
            }
            timeoutID = setTimeout(() => fn.apply(this, args), delay);
        };
    }
}

export class CookieManager
{
    public static getCookie(cname: string): string
    {
        const name = cname + '=';
        const ca = document.cookie.split(';');
        for (let c of ca)
        {
            c = c.trim();
            if (c.indexOf(name) === 0)
            {
                return decodeURIComponent(c.substring(name.length, c.length));
            }
        }
        return '';
    }

    public static setCookie(cname: string, cvalue: string, exdays?: number): void
    {
        let expires = '';
        if (exdays)
        {
            const d = new Date();
            d.setTime(d.getTime() + exdays * 24 * 60 * 60 * 1000);
            expires = 'expires=' + d.toUTCString() + ';';
        }
        document.cookie = cname + '=' + encodeURIComponent(cvalue) + ';' + expires + 'path=/';
    }
}

const COLORS = {
    success: '#389e0a',
    warning: '#faad14',
    danger: '#ff4d4f',
    purple: '#722ed1'
} as const;

export type UsageColor = 'purple' | 'green' | 'orange' | 'red';

export interface ClientUsageStats {
  total: number;
  up: number;
  down: number;
}

export interface ExpiryClient {
  enable: boolean;
  expiryTime: number | null;
}

export class ColorUtils
{
    public static usageColor(
        data: number | null | undefined,
        threshold: number,
        total: number | { valueOf(): number } | null | undefined
    ): UsageColor
    {
        const t = Number(total ?? 0);
        const d = Number(data);
        switch (true)
        {
            case data === null || data === undefined: return 'purple';
            case t < 0: return 'green';
            case t == 0: return 'purple';
            case d < t - threshold: return 'green';
            case d < t: return 'orange';
            default: return 'red';
        }
    }

    public static clientUsageColor(clientStats: ClientUsageStats | null | undefined, trafficDiff: number): string
    {
        switch (true)
        {
            case !clientStats || clientStats.total == 0: return COLORS.purple;
            case clientStats!.up + clientStats!.down < clientStats!.total - trafficDiff: return COLORS.success;
            case clientStats!.up + clientStats!.down < clientStats!.total: return COLORS.warning;
            default: return COLORS.danger;
        }
    }

    public static userExpiryColor(threshold: number, client: ExpiryClient, isDark: boolean = false): string
    {
        if (!client.enable)
        {
            return isDark ? '#2c3950' : '#bcbcbc';
        }
        const now = new Date().getTime();
        const expiry = client.expiryTime;
        switch (true)
        {
            case expiry === null: return COLORS.purple;
            case (expiry as number) < 0: return COLORS.success;
            case (expiry as number) == 0: return COLORS.purple;
            case now < (expiry as number) - threshold: return COLORS.success;
            case now < (expiry as number): return COLORS.warning;
            default: return COLORS.danger;
        }
    }
}

export interface SupportedLanguage {
  name: string;
  value: string;
  icon: string;
}

export class LanguageManager
{
    // The panel ships in two languages only: English and Persian.
    public static readonly supportedLanguages: readonly SupportedLanguage[] = [
        { name: 'فارسی', value: 'fa-IR', icon: '🇮🇷' },
        { name: 'English', value: 'en-US', icon: '🇺🇸' }
    ];

    // Default UI language. This is a Persian-first panel, so when the user has not
    // explicitly chosen a language the panel opens in Persian; English is always
    // available from the language switcher.
    public static readonly DEFAULT_LANGUAGE = 'fa-IR';

    public static getLanguage(): string
    {
        const cookie = CookieManager.getCookie('lang');
        if (cookie && LanguageManager.isSupportLanguage(cookie))
        {
            return cookie;
        }
        // No explicit choice yet → default to Persian.
        CookieManager.setCookie('lang', LanguageManager.DEFAULT_LANGUAGE, 365);
        return LanguageManager.DEFAULT_LANGUAGE;
    }

    public static setLanguage(language: string): void
    {
        if (!LanguageManager.isSupportLanguage(language))
        {
            language = LanguageManager.DEFAULT_LANGUAGE;
        }
        CookieManager.setCookie('lang', language, 365);
        window.location.reload();
    }

    public static isSupportLanguage(language: string): boolean
    {
        return LanguageManager.supportedLanguages.some((lang) => lang.value === language);
    }

    // Whether the given (or current) language is right-to-left. Persian is RTL
    // (and Arabic, if it's ever re-added).
    public static isRTL(language?: string): boolean
    {
        const l = (language || LanguageManager.getLanguage()).toLowerCase();
        return l.startsWith('fa') || l.startsWith('ar');
    }
}

/**
 * BrandManager holds the configurable panel title (default "Q-UI"). The value
 * is set from the backend (public `/getPanelTitle` pre-auth, or `/me` once
 * logged in) and cached in localStorage so every page — including the pre-auth
 * login/register screens — can render the brand instantly without a flash of
 * the default while the request is in flight.
 */
export class BrandManager
{
    public static readonly DEFAULT_TITLE = 'Q-UI';
    private static readonly STORAGE_KEY = 'panelTitle';

    public static getTitle(): string
    {
        try
        {
            const cached = window.localStorage.getItem(BrandManager.STORAGE_KEY);
            const trimmed = (cached ?? '').trim();
            return trimmed || BrandManager.DEFAULT_TITLE;
        }
        catch
        {
            return BrandManager.DEFAULT_TITLE;
        }
    }

    public static setTitle(title: string | null | undefined): string
    {
        const value = (title ?? '').trim() || BrandManager.DEFAULT_TITLE;
        try
        {
            window.localStorage.setItem(BrandManager.STORAGE_KEY, value);
        }
        catch
        {
            // localStorage unavailable (private mode / disabled) — ignore.
        }
        return value;
    }
}

export class FileManager
{
    public static downloadTextFile(content: BlobPart, filename: string = 'file.txt', options: BlobPropertyBag = { type: 'text/plain' }): void
    {
        const link = window.document.createElement('a');
        link.download = filename;
        link.style.border = '0';
        link.style.padding = '0';
        link.style.margin = '0';
        link.style.position = 'absolute';
        link.style.left = '-9999px';
        link.style.top = `${ window.pageYOffset || window.document.documentElement.scrollTop }px`;
        link.href = URL.createObjectURL(new Blob([content], options));
        link.click();
        URL.revokeObjectURL(link.href);
        link.remove();
    }
}

export type CalendarKind = 'gregorian' | 'jalalian';

export class IntlUtil
{
    public static formatDate(date: string | number | Date | null | undefined, calendar: CalendarKind = 'gregorian'): string
    {
        if (date == null)
        {
            return '';
        }
        const language = LanguageManager.getLanguage();
        const locale = calendar === 'jalalian' ? 'fa-IR' : language;

        const intlOptions: Intl.DateTimeFormatOptions = {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        };

        const intl = new Intl.DateTimeFormat(locale, intlOptions);
        return intl.format(new Date(date));
    }

    public static formatRelativeTime(date: number | null | undefined): string
    {
        if (date == null)
        {
            return '';
        }
        const language = LanguageManager.getLanguage();
        const now = new Date();
        const diff = date < 0
            ? Math.round(date / (1000 * 60 * 60 * 24))
            : Math.round((date - now.getTime()) / (1000 * 60 * 60 * 24));
        const formatter = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
        return formatter.format(diff, 'day');
    }
}
