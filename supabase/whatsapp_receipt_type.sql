-- Adds 'receipt' as a recognized whatsapp_logs.message_type, alongside the
-- existing due-date reminder types — for the "Send Receipt" button on
-- payments, distinct from a renewal/expiry reminder in the log/audit trail.
-- Safe to re-run.

ALTER TABLE whatsapp_logs DROP CONSTRAINT IF EXISTS whatsapp_logs_message_type_check;
ALTER TABLE whatsapp_logs ADD CONSTRAINT whatsapp_logs_message_type_check
  CHECK (message_type IN ('due_today', 'due_in_3_days', 'expired', 'receipt', 'custom'));
