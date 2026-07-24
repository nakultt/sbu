# Study Buddy mobile

The Android client's backend integration target is the same FastAPI contract as
the web dashboard. Start the complete backend from the repository root:

```bash
make backend
```

Use `http://10.0.2.2:8010` from the Android emulator or the development
machine's LAN address from a physical device. API discovery is available at
`/api`, and the source-of-truth OpenAPI contract is
`/api/openapi.json`. Mobile clients should preserve the response
`X-Request-ID` in diagnostics and may send it on follow-up requests.

No mobile-specific backend process or route set is required.
