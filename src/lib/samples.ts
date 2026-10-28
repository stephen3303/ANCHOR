// Sample raw traffic for the ingest demo. Fictional, like all prototype data.
// Each one shows a different ingestion rule. Dated just before the demo clock (MOCK_NOW, 24 OCT 1900Z) so due times read naturally.

export const SAMPLES: { label: string; shows: string; raw: string }[] = [
  {
    label: "FLASH sortie readiness check",
    shows: "FLASH precedence: mandatory acknowledgement within 2 hours and a site-wide alert.",
    raw: `Z 241900Z OCT 26
FM COMSUBLANT N3
TO All COMSUBLANT Units
INFO COMSUBFOR
BT
UNCLAS
COMSUBLANT 082/26
MSGID/GENADMIN/COMSUBLANT N3/OCT//
SUBJ/Sortie Readiness Check//
RMKS/1. Purpose. To direct an immediate sortie readiness check for all in-port units.
2. Action. Commanding Officers shall report material and personnel readiness to the squadron within 2 hours of receipt.
3. Point of Contact. COMSUBLANT Battle Watch, DSN 312-555-0100.
BT
`,
  },
  {
    label: "ALNAV cancelling ALNAV 076/26",
    shows: "CANCELS directive: ALNAV 076/26 is marked CANCELLED and points here.",
    raw: `R 241905Z OCT 26
FM SECNAV
TO ALNAV
INFO All Navy Activities
BT
UNCLAS
ALNAV 080/26
MSGID/GENADMIN/SECNAV/OCT//
SUBJ/Cancellation of Records Retention Reminder//
REF/A/MSG/ALNAV 076/26//
NARR/THIS MSG CANCELS REF A.//
RMKS/1. Purpose. To cancel reference (a), which is replaced by the updated records management instruction.
2. Action. Commands shall stop using the guidance in reference (a).
3. Point of Contact. DON Records Management, DSN 312-555-1313.
BT
`,
  },
  {
    label: "Corrected copy of COMSUBLANT 080/26",
    shows: "CORRECTS directive: the original safety message is marked SUPERSEDED; this one carries CORRECTED.",
    raw: `O 241910Z OCT 26
FM COMSUBLANT Safety
TO All COMSUBLANT Units
INFO COMSUBFOR
BT
UNCLAS
COMSUBLANT 083/26
MSGID/GENADMIN/COMSUBLANT Safety SAFETY/OCT//
SUBJ/Submarine Safety Stand-Down Guidance (Corrected Copy)//
REF/A/MSG/COMSUBLANT 080/26//
NARR/THIS MSG CORRECTS REF A.//
ACK/261910Z OCT 26//
RMKS/1. Purpose. To correct the completion date in reference (a).
2. Action. Commanding Officers shall conduct the stand-down NLT 07 NOV 2026 and report completion to the squadron.
3. Point of Contact. COMSUBLANT Safety Office, DSN 312-555-0303.
BT
`,
  },
];
