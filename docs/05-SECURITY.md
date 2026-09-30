# 05 - Security Standard

Minimum baseline:
- runtime input validation
- authentication bila diperlukan
- authorization terpisah dari authentication
- request/body size limit
- timeout
- safe error responses
- secret isolation
- non-root container
- least privilege DB/Redis credential
- no secrets in logs

Jangan log:
- password
- Authorization header
- API key
- access token
- refresh token
- DB credential
- Redis credential
- provider secret
- payload sensitif yang tidak diperlukan

## PostgreSQL

Gunakan user database khusus per service bila memungkinkan.

Hak akses minimum sesuai schema/table yang dimiliki service.

## Redis Worker

Redis worker credential harus terpisah dari credential administratif.

Jika Redis hanya dipakai internal, jangan expose ke internet/public interface.
