-- ============================================================
-- Oublex — allow self-delete of a solo result row.
--
-- Backs the admin-only "Reset today's run" test button (c93): an
-- admin can wipe their OWN row for today and replay the daily seed
-- to test properly. The button is admin-gated in the UI; this policy
-- only permits a user to delete their own row (auth.uid() = user_id),
-- so it can never touch anyone else's score.
-- ============================================================

CREATE POLICY oublex_solo_results_delete_own ON public.oublex_solo_results
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);
