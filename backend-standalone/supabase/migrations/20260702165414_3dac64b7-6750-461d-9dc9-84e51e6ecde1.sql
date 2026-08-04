
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS cnh_back_url text,
  ADD COLUMN IF NOT EXISTS documents_status text NOT NULL DEFAULT 'pending_upload';

ALTER TABLE public.drivers
  DROP CONSTRAINT IF EXISTS drivers_documents_status_check;
ALTER TABLE public.drivers
  ADD CONSTRAINT drivers_documents_status_check
  CHECK (documents_status IN ('pending_upload','pending_review','approved','rejected'));

-- Backfill: any driver that already uploaded the 3 legacy documents is at least "pending_review".
UPDATE public.drivers
SET documents_status = 'pending_review'
WHERE documents_status = 'pending_upload'
  AND selfie_url IS NOT NULL
  AND cnh_url IS NOT NULL
  AND vehicle_document_url IS NOT NULL;
