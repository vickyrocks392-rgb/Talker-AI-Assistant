# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x | ✅ Yes |
| < 1.0 | ❌ No |

## Reporting a Vulnerability

Please do not open a public issue. Report via confidential channel.

## Firestore Rules

See firestore.rules for hardened security rules enforcing: owner isolation, entity validation, server timestamps, and privilege escalation prevention.

## Credential Protection

- External API calls proxied through server — no keys exposed to client.
- Environment variables loaded at startup, never leaked to frontend.
