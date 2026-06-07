[English](/README.md) | [فارسی](/README.fa_IR.md) | [العربية](/README.ar_EG.md) | [中文](/README.zh_CN.md) | [Español](/README.es_ES.md) | [Русский](/README.ru_RU.md)

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./media/3x-ui-dark.png">
    <img alt="3x-ui" src="./media/3x-ui-light.png">
  </picture>
</p>

<p align="center">
  <a href="https://github.com/IntelligentQuantum/q-ui/releases"><img src="https://img.shields.io/github/v/release/IntelligentQuantum/q-ui" alt="Release"></a>
  <a href="https://github.com/IntelligentQuantum/q-ui/actions"><img src="https://img.shields.io/github/actions/workflow/status/IntelligentQuantum/q-ui/release.yml.svg" alt="Build"></a>
  <a href="#"><img src="https://img.shields.io/github/go-mod/go-version/IntelligentQuantum/q-ui.svg" alt="GO Version"></a>
  <a href="https://github.com/IntelligentQuantum/q-ui/releases/latest"><img src="https://img.shields.io/github/downloads/IntelligentQuantum/q-ui/total.svg" alt="Downloads"></a>
  <a href="https://www.gnu.org/licenses/gpl-3.0.en.html"><img src="https://img.shields.io/badge/license-GPL%20V3-blue.svg?longCache=true" alt="License"></a>
  <a href="https://pkg.go.dev/github.com/mhsanaei/3x-ui/v3"><img src="https://pkg.go.dev/badge/github.com/mhsanaei/3x-ui/v3.svg" alt="Go Reference"></a>
  <a href="https://goreportcard.com/report/github.com/mhsanaei/3x-ui/v3"><img src="https://goreportcard.com/badge/github.com/mhsanaei/3x-ui/v3" alt="Go Report Card"></a>
</p>

**3X-UI** یک پنل کنترل وب پیشرفته و متن‌باز برای مدیریت سرورهای [Xray-core](https://github.com/XTLS/Xray-core) است. این پنل یک رابط کاربری تمیز و چندزبانه برای استقرار، پیکربندی و نظارت بر طیف گسترده‌ای از پروتکل‌های پراکسی و VPN ارائه می‌دهد — از یک VPS تکی تا استقرارهای چندنودی.

‏3X-UI که به‌عنوان یک فورک بهبودیافته از پروژه‌ی اصلی Q-UI ساخته شده است، پشتیبانی گسترده‌تر از پروتکل‌ها، پایداری بهتر، حسابداری ترافیک به‌ازای هر کلاینت و بسیاری از ویژگی‌های رفاهی را اضافه می‌کند.

> [!IMPORTANT]
> این پروژه فقط برای استفاده‌ی شخصی در نظر گرفته شده است. لطفاً از آن برای اهداف غیرقانونی یا در محیط تولید (production) استفاده نکنید.

## ویژگی‌ها

- **اینباندهای چندپروتکلی** — VLESS، VMess، Trojan، Shadowsocks، WireGuard، Hysteria2، HTTP، SOCKS (Mixed)، Dokodemo-door / Tunnel و TUN.
- **ترنسپورت‌ها و امنیت مدرن** — TCP (Raw)، mKCP، WebSocket، gRPC، HTTPUpgrade و XHTTP، ایمن‌شده با TLS، XTLS و REALITY.
- **فال‌بک (Fallback)** — ارائه‌ی چند پروتکل روی یک پورت واحد (مثلاً VLESS و Trojan روی پورت 443) با استفاده از قابلیت fallback در Xray.
- **مدیریت به‌ازای هر کلاینت** — سهمیه‌ی ترافیک، تاریخ انقضا، محدودیت IP، وضعیت آنلاینِ زنده و لینک‌های اشتراک‌گذاری، کدهای QR و سابسکریپشن‌ها با یک کلیک.
- **آمار ترافیک** — به‌ازای هر اینباند، هر کلاینت و هر اوتباند، همراه با کنترل بازنشانی (reset).
- **پشتیبانی از چند نود** — مدیریت و مقیاس‌دهی روی چندین سرور از یک پنل واحد.
- **اوتباند و مسیریابی** — WARP، NordVPN، قوانین مسیریابی سفارشی، متعادل‌کننده‌های بار (load balancer) و زنجیره‌کردن پراکسی اوتباند.
- **سرور سابسکریپشن داخلی** با چندین فرمت خروجی.
- **ربات تلگرام** برای نظارت و مدیریت از راه دور.
- **‏RESTful API** همراه با مستندات Swagger درون‌پنل.
- **ذخیره‌سازی منعطف** — SQLite (پیش‌فرض) یا PostgreSQL.
- **‏۱۳ زبان رابط کاربری** با تم‌های تیره و روشن.
- **یکپارچگی با Fail2ban** برای اعمال محدودیت IP به‌ازای هر کلاینت.
- **‏RBAC چندنقشی** — چهار نقش (مدیر، ناظر، نماینده، کاربر) با ماتریس دسترسی که کاملاً در سمت سرور اعمال می‌شود، محدودسازی مالکیت (بدون IDOR)، و نوار کناری پویا و محافظ‌های مسیر مبتنی بر نقش.
- **کیف پول و تراکنش‌ها** — موجودی اعتبار به‌ازای هر کاربر با دفترِ تراکنشِ اتمی و قابل‌حسابرسی؛ مدیران موجودی را افزایش/کاهش/تنظیم می‌کنند و کاربران با زرین‌پال شارژ می‌کنند.
- **کاتالوگ محصول و فروشگاه** — مدیران/ناظران پلن‌های قابل‌فروش (ترافیک، مدت، قیمت، اینباند مقصد) را مدیریت می‌کنند؛ نمایندگان/کاربران فروشگاه را مرور کرده و با موجودی خود خرید می‌کنند.
- **سرویس‌های خودخدمت** — خرید محصول یک کانفیگ واقعی Xray برای خریدار می‌سازد؛ کاربران کانفیگ‌های خود را می‌بینند (کد QR + لینک اشتراک‌گذاری)، شناسه سابسکریپشن و کلیدها را ویرایش/بازتولید می‌کنند و پلن را تمدید یا تغییر می‌دهند.
- **سفارش‌ها** — هر خرید/تمدید به‌عنوان یک سفارش ثبت می‌شود و بر اساس نقش محدود می‌گردد (مدیران/ناظران همه را می‌بینند، نمایندگان/کاربران فقط سفارش‌های خود را).

## اسکرین‌شات‌ها

<details>
<summary>برای باز شدن کلیک کنید</summary>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./media/01-overview-dark.png">
  <img alt="Overview" src="./media/01-overview-light.png">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./media/02-add-inbound-dark.png">
  <img alt="Inbounds" src="./media/02-add-inbound-light.png">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./media/03-add-client-dark.png">
  <img alt="Add client" src="./media/03-add-client-light.png">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./media/05-add-nodes-dark.png">
  <img alt="Configs" src="./media/05-add-nodes-light.png">
</picture>

</details>

## شروع سریع

```bash
bash <(curl -Ls https://raw.githubusercontent.com/IntelligentQuantum/q-ui/master/install.sh)
```

در حین نصب، یک نام کاربری، رمز عبور و مسیر دسترسی تصادفی تولید می‌شود. پس از نصب، دستور `q-ui` را اجرا کنید تا منوی مدیریت باز شود؛ در آنجا می‌توانید سرویس را شروع/متوقف کنید، اطلاعات ورود خود را ببینید یا بازنشانی کنید، گواهی‌های SSL را مدیریت کنید و کارهای دیگری انجام دهید.

برای مستندات کامل، لطفاً به [ویکی پروژه](https://github.com/IntelligentQuantum/q-ui/wiki) مراجعه کنید.

## پلتفرم‌های پشتیبانی‌شده

**سیستم‌عامل‌ها:** Ubuntu، Debian، Armbian، Fedora، CentOS، RHEL، AlmaLinux، Rocky Linux، Oracle Linux، Amazon Linux، Virtuozzo، Arch، Manjaro، Parch، openSUSE (Tumbleweed / Leap)، Alpine و Windows.

**معماری‌ها:** `amd64` · `386` · `arm64` (aarch64) · `armv7` · `armv6` · `armv5` · `s390x`.

## گزینه‌های پایگاه‌داده

‏3X-UI از دو بک‌اند پشتیبانی می‌کند که در حین نصب انتخاب می‌شوند:

- **SQLite** (پیش‌فرض) — یک فایل واحد در مسیر `/etc/q-ui/q-ui.db`. بدون نیاز به تنظیمات، ایده‌آل برای استقرارهای کوچک و متوسط.
- **PostgreSQL** — برای تعداد کلاینت بالا یا راه‌اندازی‌های چندنودی توصیه می‌شود. نصب‌کننده می‌تواند PostgreSQL را به‌صورت محلی برایتان نصب کند، یا یک DSN به یک سرور موجود را بپذیرد.

در زمان اجرا، بک‌اند از طریق متغیرهای محیطی انتخاب می‌شود (نصب‌کننده این موارد را برای شما در `/etc/default/q-ui` می‌نویسد):

```
QUI_DB_TYPE=postgres
QUI_DB_DSN=postgres://xui:password@127.0.0.1:5432/xui?sslmode=disable
```

### انتقال یک نصب موجود SQLite به PostgreSQL

```bash
q-ui migrate-db --dsn "postgres://xui:password@127.0.0.1:5432/xui?sslmode=disable"
# سپس QUI_DB_TYPE و QUI_DB_DSN را در /etc/default/q-ui تنظیم کرده و ری‌استارت کنید:
systemctl restart q-ui
```

فایل اصلی SQLite دست‌نخورده باقی می‌ماند؛ پس از اطمینان از صحت بک‌اند جدید، آن را به‌صورت دستی حذف کنید.

### Docker

دستور پیش‌فرض `docker compose up -d` همچنان از SQLite استفاده می‌کند. برای اجرا با سرویس PostgreSQL همراه، دو خط متغیر محیطی `QUI_DB_*` را در `docker-compose.yml` از حالت کامنت خارج کنید و با پروفایل زیر اجرا کنید:

```bash
docker compose --profile postgres up -d
```

این ایمیج، Fail2ban را (که به‌صورت پیش‌فرض فعال است) برای اعمال **محدودیت‌های IP** به‌ازای هر کلاینت همراه دارد. ‏Fail2ban متخلفان را با `iptables` مسدود می‌کند که به مجوز `NET_ADMIN` نیاز دارد. فایل `docker-compose.yml` این مجوز را از قبل از طریق `cap_add` می‌دهد؛ اگر به‌جای آن کانتینر را با `docker run` اجرا می‌کنید، خودتان مجوزها را اضافه کنید، در غیر این صورت مسدودسازی‌ها فقط ثبت می‌شوند اما هرگز اعمال نمی‌شوند:

```bash
docker run -d --cap-add=NET_ADMIN --cap-add=NET_RAW ... ghcr.io/IntelligentQuantum/q-ui
```

## متغیرهای محیطی

| متغیر | توضیحات | پیش‌فرض |
| --- | --- | --- |
| `QUI_DB_TYPE` | بک‌اند پایگاه‌داده: `sqlite` یا `postgres` | `sqlite` |
| `QUI_DB_DSN` | رشته‌ی اتصال PostgreSQL (وقتی `QUI_DB_TYPE=postgres`) | — |
| `QUI_DB_FOLDER` | پوشه‌ی فایل پایگاه‌داده‌ی SQLite | `/etc/q-ui` |
| `QUI_DB_MAX_OPEN_CONNS` | حداکثر اتصالات باز (استخر PostgreSQL) | — |
| `QUI_DB_MAX_IDLE_CONNS` | حداکثر اتصالات بی‌کار (استخر PostgreSQL) | — |
| `QUI_ENABLE_FAIL2BAN` | فعال‌سازی اعمال محدودیت IP مبتنی بر Fail2ban | `true` |
| `QUI_LOG_LEVEL` | سطح گزارش‌گیری (`debug`، `info`، `warning`، `error`) | `info` |
| `QUI_DEBUG` | فعال‌سازی حالت دیباگ | `false` |

## زبان‌های پشتیبانی‌شده

رابط کاربری پنل به ۱۳ زبان در دسترس است:

English · فارسی · العربية · 中文（简体） · 中文（繁體） · Español · Русский · Українська · Türkçe · Tiếng Việt · 日本語 · Bahasa Indonesia · Português (Brasil)

## مشارکت

از مشارکت‌ها استقبال می‌شود. لطفاً پیش از باز کردن issue یا pull request، [راهنمای مشارکت](/CONTRIBUTING.md) را مطالعه کنید.

## تشکر ویژه از

- [alireza0](https://github.com/alireza0/)

## قدردانی

- [Iran v2ray rules](https://github.com/chocolate4u/Iran-v2ray-rules) (مجوز: **GPL-3.0**): _قوانین مسیریابی بهبود یافته v2ray/xray و v2ray/xray-clients با دامنه‌های ایرانی داخلی و تمرکز بر امنیت و مسدود کردن تبلیغات._
- [Russia v2ray rules](https://github.com/runetfreedom/russia-v2ray-rules-dat) (مجوز: **GPL-3.0**): _این مخزن شامل قوانین مسیریابی V2Ray به‌روزرسانی شده خودکار بر اساس داده‌های دامنه‌ها و آدرس‌های مسدود شده در روسیه است._

## ابزارهای جامعه

ابزارها و یکپارچه‌سازی‌هایی که توسط جامعه پیرامون 3x-ui ساخته شده‌اند.

- [terraform-provider-3x-ui](https://github.com/batonogov/terraform-provider-threexui) (مجوز: **MIT**): _مدیریت اینباندها، کلاینت‌ها، تنظیمات پنل و پیکربندی Xray به‌صورت کد با Terraform / OpenTofu._

## ستاره‌ها در طول زمان

[![Stargazers over time](https://starchart.cc/IntelligentQuantum/q-ui.svg?variant=adaptive)](https://starchart.cc/IntelligentQuantum/q-ui)
