import { actorFor, currentUser, getDb, json, startDemoSession } from "@/server/index";
import { acknowledgements, auditStats, getWatch, listApprovals, listAudit, listMessages, listSubscriptions, userState } from "@/server/repo";
import { canReadFullAudit, hasRole, USERS } from "@/lib/users";

/** Everything the signed-in user's screens need, in one read. */
export async function GET() {
  const user = (await currentUser()) ?? (await startDemoSession());
  await actorFor(user); // reads headers: keeps this handler request-time only
  const db = getDb();
  // The full audit log is for System Admins; everyone else gets only what their own actions wrote.
  const auditScope = canReadFullAudit(user) ? "all" : "own";
  const auditOf = auditScope === "all" ? undefined : user.login;
  return json({
    user,
    users: USERS.map(({ login, name, billet }) => ({ login, name, billet })),
    messages: listMessages(db),
    userState: userState(db, user.login),
    subscriptions: listSubscriptions(db, user.login),
    approvals: hasRole(user, "Subscription Approver") ? listApprovals(db, user.login) : [],
    audit: listAudit(db, 300, auditOf),
    auditStats: auditStats(db, auditOf),
    auditScope,
    watch: getWatch(db, user.unit),
    acknowledgements: acknowledgements(db),
    serverTime: new Date().toISOString(),
  });
}
