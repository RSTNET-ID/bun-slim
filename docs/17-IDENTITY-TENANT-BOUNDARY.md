# 17 - Identity and Tenant Boundary

## Goal

Jangan pernah memperlakukan identifier yang dikirim client sebagai authorization decision.

Header seperti:

```text
X-Tenant-ID
X-Company-ID
X-Account-ID
```

hanya boleh dianggap sebagai **requested scope**, bukan scope yang sudah dipercaya.

## Tenant Context

`tenantContext()` mewajibkan `authorizeTenant`.

Contoh:

```ts
app.use(
  '/api/v1/*',
  tenantContext({
    authorizeTenant: async (tenantId, principal) => {
      if (!principal) return false;
      return tenantAccessService.canAccess(principal.sub, tenantId);
    },
  })
);
```

Urutan middleware yang direkomendasikan:

```text
request-id
auth
tenant-context
authorization/business route
```

Jika principal belum tersedia, callback harus menolak kecuali use case memang anonymous.

## Tenant ID Validation

Default tenant identifier dibatasi ke karakter:

```text
A-Z a-z 0-9 . _ : -
```

panjang maksimum 128 karakter.

Service yang memakai UUID dapat menambahkan validasi yang lebih ketat pada authorization callback/module boundary.

## Authentication != Authorization

Valid JWT/API key hanya membuktikan identitas credential.

Masih perlu menentukan:
- principal boleh mengakses tenant mana
- role/scope apa yang dimiliki
- resource/action mana yang diizinkan

Jangan menyamakan keberadaan `X-Tenant-ID` dengan izin tenant.

## Rate Limiter Identity

Default rate limiter sekarang menggunakan urutan:
1. explicit `keyFn`
2. authenticated `principal.sub`
3. authorized `tenantId`
4. fallback `anonymous`

Ia **tidak** membaca `X-Forwarded-For` atau `X-Real-IP` secara otomatis.

Alasannya: forwarded header dapat dipalsukan bila service dapat diakses tanpa melewati trusted proxy.

## IP-Based Rate Limiting

Jika deployment benar-benar membutuhkan IP key:

```ts
rateLimiter({
  keyFn: (c) => trustedProxyResolvedClientIp(c),
});
```

Resolver tersebut menjadi tanggung jawab deployment/application integration dan harus mengetahui trusted proxy boundary.

Jangan sekadar membaca header IP dari request publik.

## Logging

Jangan log:
- bearer token
- API key
- auth credential
- full authorization object
- tenant secret/config

Principal ID/tenant ID boleh dipakai sebagai structured business context bila memang diperlukan dan sesuai kebijakan data service.
