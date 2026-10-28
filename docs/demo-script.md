# ANCHOR demo script

About ten minutes. Start from a fresh database (`docker compose down -v`, then `docker compose up --build`) and open http://localhost:3000. Everything here is fictional demo data.

1. **Home, as LT Taylor.** The red strip lists mandatory acknowledgements. Acknowledge COMSUBLANT 078/26 from the Home card. The strip count drops.
2. **Message detail.** Open NAVADMIN 236/26 (Corrected Copy). It carries CORRECTED and links to NAVADMIN 235/26, which shows SUPERSEDED with a banner. The AI summary sits apart from the official text and is labeled not authoritative.
3. **Integrity tab.** Click Verify now. The server recomputes the SHA-256 of the stored source and shows the raw C2OIX text it was parsed from.
4. **Ingest live traffic.** Admin > Ingest C2OIX Traffic > "FLASH sortie readiness check" > Ingest Message. The red strip now includes COMSUBLANT 082/26, due in 2 hours. Then ingest "ALNAV cancelling ALNAV 076/26" and open ALNAV 076/26: it is now CANCELLED and points to ALNAV 080/26.
5. **Search.** Search "sortie". The new message is found by the server's full-text index.
6. **Subscriptions and approval.** Subscriptions > request a new one. Switch user (top right) to CDR Hale. Admin shows LT Taylor's request; approve it. Switch back to LT Taylor: it is Active. Try as LT Taylor to approve your own: it isn't offered.
7. **EMCON.** Offline Mode > Simulate EMCON. Acknowledge NAVADMIN 236/26 and star a message. Reload the page: the queue and your changes are still there. Turn EMCON off, Sync Now. The audit log shows the acknowledgement with the time it was made offline.
8. **Audit & Integrity.** Run Integrity Check: every record passes and the audit chain is intact. Pick any event to see its hash and the hash it chains to.
9. **Persistence.** Restart the container (`docker compose restart`). Everything you did is still there.
