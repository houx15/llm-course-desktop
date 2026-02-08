# Bundle Format v1

This document defines the bundle artifact format for desktop update delivery.

## Artifact

- File name: `bundle.tar.gz`
- URL pattern: `/bundles/{bundle_type}/{scope_id}/{version}/bundle.tar.gz`
- Bundle is immutable once published.

## Extracted Layout

```text
bundle_root/
├── bundle.manifest.json
├── content/...
└── experts/...   # optional, depending on bundle_type
```

## `bundle.manifest.json`

```json
{
  "format_version": "bundle-v1",
  "bundle_type": "chapter",
  "scope_id": "course_x/ch1_intro",
  "version": "1.0.0",
  "created_at": "2026-02-08T00:00:00Z",
  "files": [
    {
      "path": "content/curriculum/course_x/ch1_intro/chapter_context.md",
      "sha256": "....",
      "size_bytes": 1234
    }
  ]
}
```

## Integrity

1. Outer integrity: backend returns artifact `sha256` for full tarball verification.
2. Inner integrity: optional per-file checks using `bundle.manifest.json`.

## OSS/CDN Delivery

Two supported modes:

1. Public CDN URL
- backend `artifact_url` points to CDN URL
- desktop downloads directly

2. Private OSS URL
- backend resolves object key to signed URL before returning from update APIs
- desktop still downloads directly (same client flow)

Optional:
- desktop may call `/v1/oss/download-credentials` to obtain temporary STS credentials for SDK-style direct OSS access.
