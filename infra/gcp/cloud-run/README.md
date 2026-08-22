# Cloud Run templates (offline)

These manifests are inert templates. Replace only `PROJECT_ID`, `REGION`, `IMAGE_URI`, `SERVICE_ACCOUNT`, `INSTANCE_CONNECTION_NAME`, and `SECRET_NAME` during a future activation; no resource or credential is accessed by CI. The API is a private-by-default service, the audit outbox is a bounded Cloud Run Job, and migration is a separate one-shot job. Use Secret Manager references for the complete runtime environment, never literals.
