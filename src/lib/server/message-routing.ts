import "server-only";
import { keyParts } from "@/lib/message-types";
import type { AppUser } from "@/lib/users";
import type { Message, RouteStep, RoutingEventType, WorkflowStep } from "@/lib/types";
import { selectWorkflow, nextAssignment } from "@/lib/routing";
import { hasOverlongMessageLine } from "@/lib/message-format";
import { fmtDTG } from "@/lib/format";
import { database } from "./db";
import { ApiError } from "./api-error";
import { accessArgs, DRAFT_ACCESS, appendRoutingEvent } from "./routing-data";
import { commandPeople, lockedRoutingConfig, releaseDesignation } from "./routing-config";
import { canReleaseAny, hasRole, RELEASE_AUTHORITY } from "@/lib/roles";
import { parseMessageInputs, renderSnapshot, saveReferences } from "./outgoing-messages";
import { queueRelease } from "./transmissions";

function cleanSteps(value: unknown): WorkflowStep[] {
  if (!Array.isArray(value) || !value.length || value.length > 20) throw new ApiError(400, "Choose 1–20 routing steps, ending with a release authority.");
  const ids = new Set<string>();
  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).some((key) => !["title", "personId", "action"].includes(key))) throw new ApiError(400, "Submit step definitions, not approval state.");
    const { title, personId, action } = raw;
    if (typeof title !== "string" || !title.trim() || title.length > 200 || /[\r\n\0]/.test(title) || typeof personId !== "string" || ids.has(personId)) throw new ApiError(400, "Each step needs a title and a distinct command account.");
    if (action !== (index === value.length - 1 ? "release" : "review")) throw new ApiError(400, "The chain must have exactly one final release step.");
    ids.add(personId);
    return { title: title.trim(), personId, action };
  });
}
const pendingRoute = (steps: WorkflowStep[]): RouteStep[] => steps.map(({ title, personId, action }, index) => ({ title, personId, action, order: index + 1, status: "pending" }));

export async function updateMessage(id: string, payload: unknown, user: AppUser) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new ApiError(400,"Send a transition object.");
  const body = payload as Record<string, unknown>;
  const action = body.action;
  if (typeof action !== "string" || !["edit","route","submit","advance","return","release","withdraw"].includes(action) || !Number.isSafeInteger(body.revision) || Number(body.revision) < 1) throw new ApiError(400,"An action and expected draft revision are required.");
  const allowed = action === "edit" ? ["action","revision","subject","precedence","messageType","values"] : action === "route" ? ["action","revision","steps"] : ["action","revision","comment"];
  if (Object.keys(body).some((key) => !allowed.includes(key))) throw new ApiError(400,"Unsupported transition properties; actor, route and state are server-controlled.");
  if (body.comment !== undefined && (typeof body.comment !== "string" || body.comment.length > 2000 || body.comment.includes("\0"))) throw new ApiError(400,"Comments must be text of at most 2,000 characters.");
  const comment = typeof body.comment === "string" ? body.comment.trim() : "";
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    const { rows: [row] } = await client.query(`SELECT m.*, d.template_version_id FROM outgoing_messages m JOIN message_drafts d ON d.id = m.draft_id
      WHERE ${DRAFT_ACCESS} AND m.id = $4 FOR UPDATE OF m`, [...accessArgs(user),id]);
    if (!row) throw new ApiError(404,"Draft not found.");
    if (row.routing_revision !== body.revision) throw new ApiError(409,"Draft changed. Refresh before acting again.");
    if (row.workflow_status === "released") throw new ApiError(409,"Published messages are immutable.");
    let message: Message = row.record;
    let status = row.workflow_status as string;
    let route: RouteStep[] = row.routing_route;
    let workflowId = row.workflow_id;
    let routeCustom: boolean = row.route_custom;
    let releasedAt: Date | null = null;
    let releaseSequence: number | null = null;
    let stepTitle: string | undefined;
    let event: RoutingEventType;
    let eventComment = comment;
    const at = new Date();
    const owner = row.created_by === user.id;
    const editable = ["drafting","returned","withdrawn"].includes(status);
    const step = route.find((entry) => entry.status === "current");
    if (action === "edit") {
      if (!owner) throw new ApiError(403,"Only the drafter may edit this draft.");
      const input = parseMessageInputs({ templateVersionId: row.template_version_id, subject: body.subject, precedence: body.precedence, messageType: body.messageType, values: body.values });
      const snapshot = await renderSnapshot(client,input,user,true);
      await client.query(`UPDATE message_drafts SET subject=$2,message_type=$3,precedence=$4,input_values=$5::jsonb,rendered_document=$6::jsonb,rendered_text=$7,render_metadata=$8::jsonb,originator=$9 WHERE id=$1`,
        [row.draft_id,input.subject,input.messageType,input.precedence,JSON.stringify(snapshot.values),JSON.stringify({sections:snapshot.sections,body:snapshot.text}),snapshot.text,JSON.stringify(snapshot.metadata),user.commandName]);
      await saveReferences(client,row.draft_id,snapshot);
      message = {...message,subject:input.subject,subtag:undefined,...keyParts(input.messageType),precedence:input.precedence,originator:user.commandName,renderedText:snapshot.text,rawText:snapshot.text,sections:snapshot.sections,sizeKb:Buffer.byteLength(snapshot.text)/1024};
      status="drafting"; route=pendingRoute(route);
      event="revised"; eventComment="Template inputs revised. Routing stopped and all approvals cleared; resubmit for fresh review.";
    } else if (action === "route") {
      if (!owner) throw new ApiError(403,"Only the drafter may change this routing chain.");
      const config = await lockedRoutingConfig(client,user.commandId);
      const workflow = body.steps === null ? selectWorkflow(config.workflows,message.type,message.originator) : undefined;
      if (body.steps === null && !workflow) throw new ApiError(409,"No command default matches this message.");
      const steps = cleanSteps(workflow ? workflow.steps : body.steps);
      const people = await commandPeople(user.commandId,client);
      if (steps.some((entry)=>!people.some((person)=>person.id===entry.personId&&person.status==="present"))) throw new ApiError(400,"Every holder must be an active account in this command.");
      const last=steps[steps.length-1];
      if (!releaseDesignation(people.find((person)=>person.id===last.personId),config.authorities,message.type)) throw new ApiError(400,"The final holder must be the Release Authority or a Designated Release Authority designated for this message type.");
      route=pendingRoute(steps); routeCustom=body.steps!==null; workflowId=workflow?.id??null; status="drafting";
      event="revised"; eventComment=routeCustom?"Drafter customized the routing chain. All approvals cleared; resubmit for fresh review.":"Drafter restored the command default chain. All approvals cleared; resubmit for fresh review.";
    } else if (action === "withdraw") {
      if (!owner) throw new ApiError(403,"Only the drafter may withdraw this draft.");
      if (status === "withdrawn") throw new ApiError(409,"This draft is already withdrawn.");
      status="withdrawn"; route=route.map((entry)=>entry.status==="current"?{...entry,status:"pending"}:entry);
      event="withdrawn"; eventComment=comment||"Withdrawn by the drafter.";
    } else if (action === "submit") {
      if (!owner) throw new ApiError(403,"Only the drafter may submit this draft.");
      if (!editable) throw new ApiError(409,"This draft is already under review.");
      if (!(message.rawText || message.renderedText || "").trim()) throw new ApiError(400,"Cannot route an empty message.");
      if (hasOverlongMessageLine(message.rawText || message.renderedText || "")) throw new ApiError(409,"Message lines exceed 69 characters. The drafter must save edits to apply wrapping before submitting for fresh review.");
      const config = await lockedRoutingConfig(client,user.commandId);
      const workflow = selectWorkflow(config.workflows,message.type,message.originator);
      if (!route.length && !workflow) throw new ApiError(409,"No active routing workflow matches this message.");
      const steps = cleanSteps(route.length ? route.map(({ title, personId, action }) => ({ title, personId, action })) : workflow!.steps);
      const people = await commandPeople(user.commandId,client);
      if (steps.some((entry)=>!people.some((person)=>person.id===entry.personId&&person.status==="present"))) throw new ApiError(409,"Every route step must have an active command account, with exactly one final release step.");
      const last = steps[steps.length-1];
      if (!releaseDesignation(people.find((person)=>person.id===last.personId),config.authorities,message.type)) throw new ApiError(409,"The final holder must be the Release Authority or a Designated Release Authority designated for this message type.");
      if (!route.length) workflowId=workflow!.id;
      route=pendingRoute(steps).map((entry,index)=>index===0?{...entry,status:"current"}:entry); status="in_routing"; event="submitted"; eventComment="Submitted on the saved routing chain. Every step requires fresh approval.";
    } else {
      if (status!=="in_routing" || !step) throw new ApiError(409,"This draft is not waiting on a routing step.");
      if (step.personId!==user.id) throw new ApiError(403,"Only the account holding the current step may act.");
      stepTitle=step.title;
      if (action === "return") {
        if (!comment) throw new ApiError(400,"Explain what needs correcting.");
        route=route.map((entry)=>entry.order===step.order?{...entry,status:"returned",actedAt:at.toISOString(),comment}:entry);
        status="returned"; event="returned";
      } else if (action === "advance") {
        if (step.action!=="review") throw new ApiError(409,"The final step requires release, not endorsement.");
        if (!route.some((entry)=>entry.order===step.order+1)) throw new ApiError(409,"The route has no next step.");
        route=route.map((entry)=>entry.order===step.order?{...entry,status:"endorsed",actedAt:at.toISOString(),comment}:entry.order===step.order+1?{...entry,status:"current"}:entry);
        event="advanced"; eventComment=comment||"Endorsed and advanced.";
      } else {
        if (step.action!=="release" || route.some((entry)=>entry.order<step.order&&entry.status!=="endorsed")) throw new ApiError(409,"Every preceding review must be endorsed before release.");
        if (hasOverlongMessageLine(message.rawText || message.renderedText || "")) throw new ApiError(409,"Message lines exceed 69 characters. The drafter must save edits and obtain fresh approvals before release.");
        const config=await lockedRoutingConfig(client,user.commandId);
        const designation=releaseDesignation({id:user.id,releaseAuthority:hasRole(user,RELEASE_AUTHORITY),canRelease:canReleaseAny(user)},config.authorities,message.type);
        if (!designation) throw new ApiError(403,"Release requires the Release Authority role, or the Designated Release Authority role with a designation covering this message type.");
        const assignment=nextAssignment(config.settings);
        releaseSequence=config.settings.nextSequence; releasedAt=at;
        message={...message,kind:"released",source:"ANCHOR release",dtg:fmtDTG(at),received:at.toISOString(),reference:`${message.originator} ${message.type} ${assignment.localSequence}`,
          localSequence:assignment.localSequence,msn:assignment.msn,releasedAt:at.toISOString(),releasedBy:user.id,releaseDesignation:designation};
        await client.query("UPDATE command_routing SET settings=jsonb_set(settings,'{nextSequence}',$2::jsonb),revision=revision+1,updated_at=now() WHERE command_id=$1",[user.commandId,JSON.stringify(assignment.nextSequence)]);
        route=route.map((entry)=>entry.order===step.order?{...entry,status:"released",actedAt:at.toISOString(),comment}:entry);
        status="released"; event="released"; eventComment=`Released as ${designation}, ${assignment.localSequence}. Queued for transmission by the Message Admin.`;
      }
    }
    const revision=row.routing_revision+1;
    await client.query(`UPDATE outgoing_messages SET record=$2::jsonb,workflow_status=$3,routing_route=$4::jsonb,workflow_id=$5,routing_revision=$6,updated_at=$7,
        released_at=$8,released_by=$9,release_sequence=$10,received_at=$11,route_custom=$12 WHERE id=$1`,
      [id,JSON.stringify(message),status,JSON.stringify(route),workflowId,revision,at,releasedAt,releasedAt?user.id:null,releaseSequence,message.received,routeCustom]);
    await appendRoutingEvent(client,message,user,revision,event,eventComment,stepTitle,at);
    // A released message is final. It waits in the queue until the Message Admin transmits it.
    if (releasedAt) await queueRelease(client,message,user,at);
    await client.query("COMMIT");
    return message;
  } catch(error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
