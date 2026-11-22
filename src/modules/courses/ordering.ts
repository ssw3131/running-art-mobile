/** Latest active attempt wins; otherwise use real completion time (including simulations).
 * Rank active attempts before ended unfinished attempts, then the other courses.
 * Apply before LIMIT/OFFSET so old active courses stay in home and the first page.
 * The fixed `c` alias always refers to an owner-filtered saved_courses row.
 */
export const latestSavedAttemptOrder = `(r.status!='completed') DESC,coalesce(r.ended_at,r.started_at) DESC,r.started_at DESC,r.id DESC`;
export const savedCourseOrderSql = `coalesce((SELECT CASE WHEN r.status!='completed' THEN 0 WHEN r.course_outcome='finished' THEN 2 ELSE 1 END
 FROM running_sessions r WHERE r.owner_id=c.owner_id AND (r.course_id=c.id OR r.course_snapshot_hash=c.snapshot_hash)
 ORDER BY ${latestSavedAttemptOrder} LIMIT 1),2),c.created_at DESC,c.id DESC`;
