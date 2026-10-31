-- Read receipts: the messages.send_status CHECK constraint predates the E2EE
-- delivery-status RPC (20261029_signal_e2ee.sql) and did not admit 'read' —
-- every mark_messages_status(... 'read') call failed with 23514, so read
-- ticks could never persist. Widen the constraint to the full state machine.
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_send_status_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_send_status_check
  CHECK (((send_status)::text = ANY ((
    ARRAY['sending'::character varying,
          'sent'::character varying,
          'delivered'::character varying,
          'read'::character varying,
          'failed'::character varying])::text[])));
