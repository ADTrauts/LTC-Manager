BEGIN;

-- Match the lock order of inserts: ticket table first, then its sequence.
LOCK TABLE public."SupportTicket" IN SHARE ROW EXCLUSIVE MODE;
ALTER SEQUENCE public."SupportTicket_number_seq" START WITH 1001;

DO $$
DECLARE
    next_number bigint;
BEGIN
    -- START changes the reset default only. Preserve both existing tickets and
    -- values already allocated by the sequence, including rolled-back inserts.
    SELECT GREATEST(
        1001::bigint,
        COALESCE((SELECT MAX("number")::bigint + 1 FROM public."SupportTicket"), 1001),
        last_value + CASE WHEN is_called THEN 1 ELSE 0 END
    )
    INTO next_number
    FROM public."SupportTicket_number_seq";

    EXECUTE format('ALTER SEQUENCE public."SupportTicket_number_seq" RESTART WITH %s', next_number);
END
$$;

COMMIT;
