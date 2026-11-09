// Count known browsers, not buyers or IP addresses. The two groups are disjoint
// within the selected period. A return in a different session takes precedence
// over the initial visit; reloading or heartbeats in one session do not.
export function visitorSegments(db,id,{from,to},source='native') {
  const history=source==='native'
    ? {sql:'SELECT visitor_id,date,session_id AS visit_id FROM live_sessions WHERE source_id=?',args:[id]}
    : source==='nexora'
      ? {sql:`SELECT visitor_id,date,session_id AS visit_id FROM landing_sessions WHERE landing_id=?
          UNION ALL SELECT v.visitor_id,v.date,'legacy:'||v.date AS visit_id FROM landing_visits v WHERE v.landing_id=?
          AND NOT EXISTS(SELECT 1 FROM landing_sessions s WHERE s.landing_id=v.landing_id AND s.visitor_id=v.visitor_id AND s.date=v.date)`,args:[id,id]}
      : null;
  if(!history)throw Error('Invalid visitor source');
  const row=db.prepare(`WITH history AS (${history.sql}), visitors AS (
    SELECT visitor_id,MIN(date) AS first_date,COUNT(DISTINCT visit_id) AS visits FROM history
    WHERE date<=? AND TRIM(COALESCE(visitor_id,''))<>''
    GROUP BY visitor_id HAVING MAX(date)>=?
  ) SELECT COUNT(*) AS total,
    COALESCE(SUM(first_date>=? AND visits=1),0) AS new_visitors,
    COALESCE(SUM(first_date<? OR visits>1),0) AS returning_visitors FROM visitors`)
    .get(...history.args,to,from,from,from);
  return {...row,basis:'browser',classification:'returning_session'};
}
