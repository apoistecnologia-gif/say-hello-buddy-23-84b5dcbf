ALTER TYPE public.driver_approval_status RENAME VALUE 'pending_approval' TO 'em_analise';
ALTER TYPE public.driver_approval_status RENAME VALUE 'approved' TO 'aprovado';
ALTER TYPE public.driver_approval_status RENAME VALUE 'rejected' TO 'reprovado';
ALTER TYPE public.driver_approval_status RENAME VALUE 'blocked' TO 'bloqueado';

ALTER TABLE public.drivers
  ALTER COLUMN approval_status SET DEFAULT 'em_analise'::public.driver_approval_status;

ALTER TABLE public.drivers
  RENAME COLUMN rejection_reason TO motivo_reprovacao;