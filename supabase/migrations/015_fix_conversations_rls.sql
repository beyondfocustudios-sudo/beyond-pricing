-- Migration 015: Fix conversations/messages RLS to allow all team_members access
-- Root cause: previous policy required project_members, but new org members
-- only have team_members rows (not yet assigned to specific projects).

-- ============================================================
-- CONVERSATIONS
-- ============================================================

DROP POLICY IF EXISTS "conversations_select" ON conversations;
CREATE POLICY "conversations_select" ON conversations FOR SELECT USING (
  -- any org team member can see all conversations
  EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid())
  OR
  -- project member (non-client role)
  EXISTS (
    SELECT 1 FROM project_members pm
    WHERE pm.project_id = conversations.project_id
      AND pm.user_id = auth.uid()
      AND pm.role NOT IN ('client_viewer', 'client_approver')
  )
  OR
  -- client portal user
  EXISTS (
    SELECT 1 FROM client_users cu
    WHERE cu.client_id = conversations.client_id
      AND cu.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "conversations_insert" ON conversations;
CREATE POLICY "conversations_insert" ON conversations FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM project_members pm
    WHERE pm.project_id = conversations.project_id
      AND pm.user_id = auth.uid()
      AND pm.role NOT IN ('client_viewer', 'client_approver')
  )
);

-- ============================================================
-- MESSAGES
-- ============================================================

DROP POLICY IF EXISTS "messages_select" ON messages;
CREATE POLICY "messages_select" ON messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id
      AND (
        EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid())
        OR EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm.project_id = c.project_id AND pm.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM client_users cu
          WHERE cu.client_id = c.client_id AND cu.user_id = auth.uid()
        )
      )
  )
);

DROP POLICY IF EXISTS "messages_insert" ON messages;
CREATE POLICY "messages_insert" ON messages FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id
      AND (
        -- team senders: must be team member or project member (non-client)
        (
          messages.sender_type = 'team'
          AND (
            EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid())
            OR EXISTS (
              SELECT 1 FROM project_members pm
              WHERE pm.project_id = c.project_id
                AND pm.user_id = auth.uid()
                AND pm.role NOT IN ('client_viewer', 'client_approver')
            )
          )
        )
        OR
        -- client senders: must be a client_user for this conversation's client
        (
          messages.sender_type = 'client'
          AND EXISTS (
            SELECT 1 FROM client_users cu
            WHERE cu.client_id = c.client_id AND cu.user_id = auth.uid()
          )
        )
      )
  )
);

-- ============================================================
-- MESSAGE_READS
-- ============================================================

-- Ensure message_reads policies allow team members to mark reads
DROP POLICY IF EXISTS "message_reads_select" ON message_reads;
CREATE POLICY "message_reads_select" ON message_reads FOR SELECT USING (
  user_id = auth.uid()
);

DROP POLICY IF EXISTS "message_reads_insert" ON message_reads;
CREATE POLICY "message_reads_insert" ON message_reads FOR INSERT WITH CHECK (
  user_id = auth.uid()
);

DROP POLICY IF EXISTS "message_reads_upsert" ON message_reads;
-- Allow upsert via insert with ON CONFLICT (covered by insert policy above)
