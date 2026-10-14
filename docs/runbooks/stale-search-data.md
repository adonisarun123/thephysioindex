# Stale search or profile data

Search and profile pages read the authoritative tables on every request; there is no separate search index. "Stale" therefore usually means one of the derived fields is out of date, or the browser/CDN served an old page.

| Symptom | Likely cause | Fix |
|---|---|---|
| Name search does not find a renamed practitioner | `search_vector` not refreshed (trigger only fires on name, designation, headline) | `UPDATE practitioners SET display_name = display_name WHERE id = '<id>';` |
| Rating or review count wrong | Average not recalculated after a moderation change | Re-run recalculation (below) |
| Profile still visible after suspension | Old page in the browser or a shared link preview | Hard refresh; the server returns the suspended view immediately (check with a private window) |
| Location page lists no one but listings exist | Practitioner's clinic association not approved, or branch/clinic not published | Admin → Practitioners → clinics; LOC-02 approves associations with the listing |
| Sitemap missing new pages | Sitemaps are cached up to an hour (`s-maxage=3600`) | Wait, or redeploy |

## Recalculate review averages for everyone
```sql
UPDATE practitioners p SET review_count = s.n, rating_avg_x100 = s.avg
FROM (
  SELECT p2.id, count(r.id)::int AS n, CASE WHEN count(r.id) = 0 THEN NULL ELSE round(avg(r.rating) * 100)::int END AS avg
  FROM practitioners p2 LEFT JOIN reviews r ON r.practitioner_id = p2.id AND r.state = 'published' GROUP BY p2.id
) s WHERE s.id = p.id AND (p.review_count IS DISTINCT FROM s.n OR p.rating_avg_x100 IS DISTINCT FROM s.avg);
```
Run it in a transaction and check the row count before committing. This needs the owner role; the runtime role can update but should not be used from the console.

## Verify and record
Search for the practitioner by name and location in a private window. Record what was stale and why.
