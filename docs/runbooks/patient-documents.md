# Patient documents storage (EMR-07)

Files live in a **private** Vercel Blob store (`BLOB_READ_WRITE_TOKEN`). Nothing is publicly reachable: `/api/v1/patient-documents?id=…` checks patient-record access, writes `patient_document.view` to the audit log and streams the bytes with `Cache-Control: private, no-store`.

- Keys: `patients/<practitionerId>/<patientId>/<uuid>`. No names or clinical words in keys.
- Accepted: PDF, JPEG, PNG, WebP, detected from the file's bytes; ≤ 4 MB (server action body limit 4.4 MB; Vercel request limit 4.5 MB).
- Delete removes the object and keeps a tombstone row (`deleted_at`, `deleted_by`).
- No token → uploads are switched off and the record page says storage is being set up.
- Local development: `STORAGE_LOCAL_DIR=/tmp/tpi-store` (refused on Vercel).
- Erasure request for a whole patient: delete each document (removes bytes), then clear the patient's fields, or ask engineering to run a scripted erasure. A scripted erasure still needs to be written; it is not built yet.
- Backups: Blob objects are not covered by Neon's restore window. Decide on a backup or export policy before launch.
