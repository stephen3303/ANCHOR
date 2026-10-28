# ANCHOR demo script

About ten minutes. Start from a fresh database (`docker compose down -v`, then `docker compose up --build`) and open http://localhost:3000. Everything here is fictional demo data.

1. **Home, as LT Taylor.** The red strip lists mandatory acknowledgements. Acknowledge COMSUBLANT 078/26 from the Home card. The strip count drops.
2. **Message detail.** Open NAVADMIN 236/26 (Corrected Copy). It carries CORRECTED and links to NAVADMIN 235/26, which shows SUPERSEDED with a banner. The AI summary sits apart from the official text and is labeled not authoritative.
3. **Integrity tab.** Click Verify now. The server recomputes the SHA-256 of the stored source and shows the raw C2OIX text it was parsed from.
4. **Ingest live traffic.** Admin > Ingest C2OIX Traffic > "FLASH sortie readiness check" > Ingest Message. The red strip now includes COMSUBLANT 082/26, due in 2 hours. Then ingest "ALNAV cancelling ALNAV 076/26" and open ALNAV 076/26: it is now CANCELLED and points to ALNAV 080/26.
5. **Search.** Search "sortie". The new message is found by the server's full-text index.
6. **Subscriptions and approval.** Subscriptions > request a new one. Switch user (top right) to CDR Hale. Admin shows LT Taylor's request; approve it. Switch back to LT Taylor: it is Active. Try as LT Taylor to approve your own: it isn't offered.
7. **EMCON.** Offline Mode > Simulate EMCON. Acknowledge NAVADMIN 236/26 and star a message. Reload the page: the queue and your changes are still there. Turn EMCON off, Sync Now. The audit log shows the acknowledgement with the time it was made offline.
8. **Network topology: messages queueing under limited connectivity.** As LT Taylor (System Admin), open Network Topology and press Reset demonstration so all ten example messages sit in the C2OIX queue and every link is up. Each node shows its count; C2OIX shows the next message in queue, the ANCHOR server and each workstation show the last message received.
   1. **Normal.** Drop 1 message. C2OIX goes from 10 to 9; ANCHOR and all three workstations go to 1 and show CSL-2614-0187.
   2. **Circuit down.** Click "C2OIX circuit: up · break". Drop 3 messages. C2OIX still shows 9: the three are released but waiting there, not transmitted ("3 released and waiting here"), and ANCHOR stays at 1.
   3. **A workstation cut off too.** Click "WS-02 link: up · break".
   4. **Circuit back.** Click "C2OIX circuit: down · restore". The three waiting messages arrive at once: C2OIX 6, ANCHOR 4, WS-01 and WS-03 at 4. WS-02 stays at 1 and reads "3 messages waiting at ANCHOR".
   5. **Workstation back.** Click "WS-02 link: down · restore". WS-02 catches up to 4, last received NVA-2614-0455.
   6. **Proof.** Audit & Integrity lists every drop and link change with who did it.
9. **Audit & Integrity.** Run Integrity Check: every record passes and the audit chain is intact. Pick any event to see its hash and the hash it chains to.
10. **Persistence.** Restart the container (`docker compose restart`). Everything you did is still there.

## The same sequence in the Base44 app

Network topology page, signed in as an administrator. First press **Stop automatic feed** in the C2OIX release panel so only your clicks move traffic, and **Reload example traffic** if the queue is not full. Then run steps 8.1 to 8.5 above with **Drop 1 message**, **Drop 3 messages**, the C2OIX circuit link, and the WS-02 link. Breaking the circuit there also puts every screen into Offline mode, which is worth pointing out while the three messages wait at C2OIX.
