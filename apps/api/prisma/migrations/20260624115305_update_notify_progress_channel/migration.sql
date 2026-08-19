-- Overwrite notify_progress_channel trigger function to use session-scoped channel names
CREATE OR REPLACE FUNCTION notify_progress_channel()
RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify(
    'progress_' || replace(NEW.session_id::text, '-', '_'),
    json_build_object(
      'document_id',      NEW.document_id,
      'status',           NEW.status,
      'progress_pct',     NEW.progress_pct,
      'processed_chunks', NEW.processed_chunks,
      'total_chunks',     NEW.total_chunks,
      'error_code',       NEW.error_code,
      'error_message',    NEW.error_message
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
