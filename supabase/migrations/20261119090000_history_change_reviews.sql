-- Historical power/tariff change reviews. No invoice or detected-energy source is mutated.
CREATE TABLE IF NOT EXISTS private.history_change_reviews (
  supply_id uuid NOT NULL REFERENCES public.supplies(id) ON DELETE RESTRICT,
  previous_invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  current_invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('power','tariff')),
  is_archived boolean NOT NULL DEFAULT true,
  reviewed_by uuid,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (supply_id, previous_invoice_id, current_invoice_id, event_type),
  CHECK (previous_invoice_id <> current_invoice_id)
);
ALTER TABLE private.history_change_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.history_change_reviews FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_history_change_reviews(p_supply_ids uuid[])
RETURNS TABLE (supply_id uuid, previous_invoice_id uuid, current_invoice_id uuid, event_type text, is_archived boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_internal_user() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE='42501';
  END IF;
  IF COALESCE(cardinality(p_supply_ids),0)>1000 THEN
    RAISE EXCEPTION 'too_many_supplies';
  END IF;
  RETURN QUERY
  SELECT r.supply_id,r.previous_invoice_id,r.current_invoice_id,r.event_type,r.is_archived
  FROM private.history_change_reviews r
  WHERE r.supply_id = ANY(COALESCE(p_supply_ids, ARRAY[]::uuid[]));
END; $$;

CREATE OR REPLACE FUNCTION public.set_history_change_review(
  p_supply_id uuid,
  p_previous_invoice_id uuid,
  p_current_invoice_id uuid,
  p_event_type text,
  p_archive boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_changed boolean := false;
BEGIN
  IF v_actor IS NULL OR NOT private.is_internal_user() THEN
    RETURN jsonb_build_object('ok',false,'reason','not_authorized');
  END IF;
  IF p_supply_id IS NULL OR p_previous_invoice_id IS NULL OR p_current_invoice_id IS NULL
     OR p_previous_invoice_id = p_current_invoice_id
     OR p_event_type NOT IN ('power','tariff') OR p_event_type IS NULL
     OR p_archive IS NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_event_key');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.invoices a
    JOIN public.invoices b ON b.id=p_current_invoice_id
    WHERE a.id=p_previous_invoice_id
      AND a.supply_id=p_supply_id AND b.supply_id=p_supply_id
  ) THEN
    RETURN jsonb_build_object('ok',false,'reason','invoice_supply_mismatch');
  END IF;
  INSERT INTO private.history_change_reviews AS r (
    supply_id,previous_invoice_id,current_invoice_id,event_type,is_archived,reviewed_by,reviewed_at
  ) VALUES (
    p_supply_id,p_previous_invoice_id,p_current_invoice_id,p_event_type,p_archive,v_actor,now()
  )
  ON CONFLICT (supply_id,previous_invoice_id,current_invoice_id,event_type)
  DO UPDATE SET is_archived=EXCLUDED.is_archived,reviewed_by=EXCLUDED.reviewed_by,reviewed_at=now()
  WHERE r.is_archived IS DISTINCT FROM EXCLUDED.is_archived
  RETURNING true INTO v_changed;
  IF COALESCE(v_changed,false) THEN
    INSERT INTO public.audit_log(actor_user_id,action,entity_type,entity_id,details)
    VALUES (v_actor,CASE WHEN p_archive THEN 'history_change_archived' ELSE 'history_change_restored' END,
      'supply',p_supply_id,jsonb_build_object(
        'previous_invoice_id',p_previous_invoice_id,'current_invoice_id',p_current_invoice_id,
        'event_type',p_event_type,'archived',p_archive));
  END IF;
  RETURN jsonb_build_object('ok',true,'archived',p_archive,'changed',COALESCE(v_changed,false));
END; $$;

REVOKE ALL ON FUNCTION public.get_history_change_reviews(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_history_change_review(uuid,uuid,uuid,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_history_change_reviews(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_history_change_review(uuid,uuid,uuid,text,boolean) TO authenticated;
