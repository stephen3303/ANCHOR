import { actorFor, currentUser, getDb, json, startDemoSession } from "@/server/index";
import { acknowledgements, auditFor, getWatch, listApprovals, listMessages, listSubscriptions, userState } from "@/server/repo";
import { hasRole, USERS } from "@/lib/users";

/** Everything the signed-in user's screens need, in one read. */
export async function GET() {
  const user = (await currentUser()) ?? (await startDemoSession());
  await actorFor(user); // reads headers: keeps this handler request-time only
  const db = getDb();
  return json({
    user,
    users: USERS.map(({ login, name, billet }) => ({ login, name, billet })),
    messages: listMessages(db),
    userState: userState(db, user.login),
    subscriptions: listSubscriptions(db, user.login),
    approvals: hasRole(user, "Subscription Approver") ? listApprovals(db, user.login) : [],
    // The full audit log is for System Admins; everyone else gets only what their own actions wrote.
    ...auditFor(db, user),
    watch: getWatch(db, user.unit),
    acknowledgements: acknowledgements(db),
    serverTime: new Date().toISOString(),
  });
}
