# ADR-001 - Dedicated MySQL 8 Database Variant

## Status

Accepted.

## Context

Bun Slim `main` uses PostgreSQL as its database baseline. A separate MySQL 8 variant is required without turning runtime configuration into a multi-dialect abstraction layer.

Although Bun.SQL supports both PostgreSQL and MySQL, SQL dialect behavior differs in material areas:

- DML `RETURNING`
- UUID types and generation
- timestamp types
- upsert syntax
- advisory/named locking
- DDL transaction semantics
- index creation/drop syntax
- authentication and TLS behavior

Trying to keep one branch dynamically portable would increase conditional logic in repository and migration code while making integration coverage harder to reason about.

## Decision

Maintain two database-specific baselines:

- `main`: PostgreSQL
- `mysql-v8`: MySQL 8

The MySQL branch preserves handler, service, API, and domain contracts while replacing database-specific implementation at the persistence boundary.

MySQL 8 decisions:

- `DB_DRIVER=mysql` is enforced
- application-generated UUIDs are stored as `CHAR(36)` using ASCII binary collation
- timestamps use `DATETIME(3)`
- DML does not rely on `RETURNING`
- migration serialization uses MySQL `GET_LOCK()` / `RELEASE_LOCK()` on a reserved connection
- migrations are retry-safe because MySQL DDL can implicitly commit
- plaintext RSA public-key retrieval is development/test-only; production uses TLS

## Consequences

### Positive

- each branch has one explicit database contract
- repository/migration code stays idiomatic for its database
- CI can test the actual target database
- business/service layers remain stable
- failures caused by pretending SQL dialects are interchangeable are avoided

### Negative

- database-specific fixes may need to be ported between branches
- migrations can diverge in syntax and operational behavior
- schema parity must be reviewed intentionally

## Maintenance Rule

Changes to shared business behavior should be implemented consistently in both variants when applicable.

Database-specific changes must not be merged mechanically across branches without reviewing dialect, transaction, locking, indexing, and datatype semantics.
