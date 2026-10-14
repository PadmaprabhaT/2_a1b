-- ---------------------------
-- Step 3
-- Workflow 1: Atomic Booking (stored procedure)
-- ---------------------------

DROP PROCEDURE IF EXISTS process_booking_payment (UUID, UUID, DECIMAL, DATE, INTEGER);
DROP PROCEDURE IF EXISTS process_booking_payment (UUID, UUID, DECIMAL, DATE, INTEGER, UUID, BOOLEAN, TEXT);

CREATE
OR REPLACE PROCEDURE process_booking_payment (
    p_guest_id UUID,
    p_property_id UUID,
    p_total_cost DECIMAL(10, 2),
    p_check_in DATE DEFAULT CURRENT_DATE,
    p_nights INTEGER DEFAULT 1,
    INOUT p_booking_id UUID DEFAULT NULL,
    INOUT p_success BOOLEAN DEFAULT NULL,
    INOUT p_error TEXT DEFAULT NULL
) LANGUAGE plpgsql AS $$
DECLARE
    v_balance    DECIMAL(10, 2);
    v_booking_id UUID;
    v_failed     BOOLEAN;
    v_errmsg     TEXT;
    v_errstate   TEXT;
BEGIN
    COMMIT;
    SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;

    v_failed := FALSE;

    BEGIN
        -- Sanity checks
        IF p_total_cost IS NULL OR p_total_cost <= 0 THEN
            RAISE EXCEPTION 'total_cost must be positive, got %', p_total_cost
                USING ERRCODE = 'check_violation';
        END IF;

        IF p_nights IS NULL OR p_nights < 1 THEN
            RAISE EXCEPTION 'a stay must be at least 1 night, got %', p_nights
                USING ERRCODE = 'check_violation';
        END IF;

        -- Lock guest row
        SELECT wallet_balance INTO v_balance
        FROM guests
        WHERE id = p_guest_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Guest % not found', p_guest_id
                USING ERRCODE = 'foreign_key_violation';
        END IF;

        -- Deduct
        UPDATE guests
        SET wallet_balance = wallet_balance - p_total_cost
        WHERE id = p_guest_id;
        -- Fires trg_guest_wallet_audit

        INSERT INTO bookings (
            guest_id,
            property_id,
            total_cost,
            status,
            check_in_date,
            check_out_date
        )
        VALUES (
            p_guest_id,
            p_property_id,
            p_total_cost,
            'CONFIRMED',
            p_check_in,
            p_check_in + p_nights
        )
        RETURNING id INTO v_booking_id;

    EXCEPTION
        WHEN check_violation THEN
            -- Insufficient funds, or a rejected cost or night count.
            v_failed   := TRUE;
            v_errstate := SQLSTATE;
            IF SQLERRM LIKE '%guests_wallet_balance_check%' THEN
                v_errmsg := 'This guest does not have enough wallet balance for this stay.';
            ELSE
                v_errmsg := SQLERRM;
            END IF;
        WHEN serialization_failure THEN
            -- Concurrency conflict
            v_failed   := TRUE;
            v_errstate := SQLSTATE;
            v_errmsg   := SQLERRM;
        WHEN unique_violation THEN
            -- Duplicate booking
            v_failed   := TRUE;
            v_errstate := SQLSTATE;
            v_errmsg   := SQLERRM;
        WHEN foreign_key_violation THEN
            -- Unknown guest or property
            v_failed   := TRUE;
            v_errstate := SQLSTATE;
            v_errmsg   := SQLERRM;
    END;

    IF v_failed THEN
        -- Discard changes
        ROLLBACK;
        p_booking_id := NULL;
        p_success := FALSE;
        p_error := v_errmsg;
        RAISE WARNING 'Booking rejected [%]: %', v_errstate, v_errmsg;
    ELSE
        COMMIT;
        p_booking_id := v_booking_id;
        p_success := TRUE;
        p_error := NULL;
        RAISE NOTICE 'Booking % committed for guest %', v_booking_id, p_guest_id;
    END IF;
END;
$$;
