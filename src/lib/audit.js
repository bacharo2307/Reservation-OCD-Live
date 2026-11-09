'use strict';
// Journal d'activité : chaque modification importante faite par l'équipe est historisée.

async function audit(client, req, action, entity, entityId, details) {
  const a = req && req.admin;
  await client.query(
    `INSERT INTO audit_log (actor_id, actor_email, action, entity, entity_id, details, ip) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [a ? a.id : null, a ? a.email : 'système', action, entity, entityId == null ? null : String(entityId), details || null, req ? req.ip : null]
  );
}

module.exports = { audit };
