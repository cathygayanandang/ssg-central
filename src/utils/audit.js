import { supabase } from '../lib/supabaseClient'

/**
 * Records an entry in the audit_logs table.
 * @param {string} userId - people.id of the actor (nullable)
 * @param {'create'|'update'|'delete'|'login'} action
 * @param {string} entityType - e.g. 'people', 'event', 'fine'
 * @param {string|null} entityId
 * @param {object} details - extra JSON context
 */
export async function logAction(userId, action, entityType, entityId = null, details = {}) {
  try {
    await supabase.from('audit_logs').insert({
      user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details,
    })
  } catch (err) {
    console.error('Failed to write audit log', err)
  }
}
