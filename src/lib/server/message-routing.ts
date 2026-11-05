import "server-only";
import type { AppUser } from "@/lib/users";
import type { Message, RouteStep, RoutingEventType } from "@/lib/types";
import { selectWorkflow, buildRoute, nextAssignment } from "@/lib/routing";
import { fmtDTG } from "@/lib/format";
import { database } from "./db";
import { ApiError } from "./api-error";
import { accessArgs, DRAFT_ACCESS, appendRoutingEvent } from "./routing-data";
import { commandPeople, lockedRoutingConfig } from "./routing-config";
import { parseMessageInputs, renderSnapshot, saveReferences } from "./outgoing-messages";
import { sha256, storeMessage } from "./messages";

export async function updateMessage(id: string, payload: unknown, user: AppUser) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new ApiError(400,"Send a transition object.");
  const body = payload as Record<string, unknown>;
  const action = body.action;
  if (typeof action !== "string" || !["edit","submit","advance","return","release","withdraw"].includes(action) || !Number.isSafeInteger(body.revision) || Number(body.revision) < 1) throw new ApiError(400,"An action and expected draft revision are required.");
  const allowed = action === "edit" ? ["action","revision","subject","precedence","messageType","values"] : ["action","revision","comment"];
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
    if (["released","withdrawn"].includes(row.workflow_status)) throw new ApiError(409,"Released and withdrawn records are frozen.");
    let message: Message = row.record;
    let status = row.workflow_status as string;
    let route: RouteStep[] = row.routing_route;
    let workflowId = row.workflow_id;
    let releasedAt: Date | null = null;
    let releaseSequence: number | null = null;
    let stepTitle: string | undefined;
    let event: RoutingEventType;
    let eventComment = comment;
    const at = new Date();
    const owner = row.created_by === user.id;
    const editable = ["drafting","returned"].includes(status);
    const step = route.find((entry) => entry.status === "current");
    if (action === "edit") {
      if (!owner) throw new ApiError(403,"Only the drafter may edit this draft.");
      if (!editable) throw new ApiError(409,"Text is frozen while under review. Return it for correction first.");
      const input = parseMessageInputs({ templateVersionId: row.template_version_id, subject: body.subject, precedence: body.precedence, messageType: body.messageType, values: body.values });
      const snapshot = await renderSnapshot(client,input,user,true);
      await client.query(`UPDATE message_drafts SET subject=$2,message_type=$3,precedence=$4,input_values=$5::jsonb,rendered_document=$6::jsonb,rendered_text=$7,render_metadata=$8::jsonb,originator=$9 WHERE id=$1`,
        [row.draft_id,input.subject,input.messageType,input.precedence,JSON.stringify(snapshot.values),JSON.stringify({sections:snapshot.sections,body:snapshot.text}),snapshot.text,JSON.stringify(snapshot.metadata),user.commandName]);
      await saveReferences(client,row.draft_id,snapshot);
      message = {...message,subject:input.subject,type:input.messageType,precedence:input.precedence,originator:user.commandName,renderedText:snapshot.text,rawText:snapshot.text,sections:snapshot.sections,sizeKb:Buffer.byteLength(snapshot.text)/1024};
      event="revised"; eventComment="Template inputs revised; fresh approvals are required on resubmission.";
    } else if (action === "withdraw") {
      if (!owner) throw new ApiError(403,"Only the drafter may withdraw this draft.");
      status="withdrawn"; route=route.map((entry)=>entry.status==="current"?{...entry,status:"pending"}:entry);
      event="withdrawn"; eventComment=comment||"Withdrawn by the drafter.";
    } else if (action === "submit") {
      if (!owner) throw new ApiError(403,"Only the drafter may submit this draft.");
      if (!editable) throw new ApiError(409,"This draft is already under review.");
      if (!(message.rawText || message.renderedText || "").trim()) throw new ApiError(400,"Cannot route an empty message.");
      const config = await lockedRoutingConfig(client,user.commandId);
      const workflow = selectWorkflow(config.workflows,message.type,message.originator);
      if (!workflow) throw new ApiError(409,"No active routing workflow matches this message.");
      const people = await commandPeople(user.commandId,client);
      if (!workflow.steps.length || workflow.steps.some((entry,index)=>entry.action !== (index===workflow.steps.length-1?"release":"review") || !people.some((person)=>person.id===entry.personId&&person.status==="present"))) throw new ApiError(409,"Every route step must have an active command account, with exactly one final release step.");
      const last = workflow.steps[workflow.steps.length-1];
      const authority = config.authorities.find((entry)=>entry.personId===last.personId&&(!entry.scope.length||entry.scope.includes(message.type)));
      if (!authority || !people.find((person)=>person.id===last.personId)?.canRelease) throw new ApiError(409,"The final holder needs a matching designation and Designated Release Authority role.");
      route=buildRoute(workflow); workflowId=workflow.id; status="in_routing"; event="submitted"; eventComment=`Submitted on ${workflow.name}. All steps require approval.`;
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
        const config=await lockedRoutingConfig(client,user.commandId);
        const authority=config.authorities.find((entry)=>entry.personId===user.id&&(!entry.scope.length||entry.scope.includes(message.type)));
        if (!authority || !user.roles.some((role)=>role.name==="Designated Release Authority"&&role.granted)) throw new ApiError(403,"Release requires a matching command designation and the Designated Release Authority role.");
        const assignment=nextAssignment(config.settings);
        releaseSequence=config.settings.nextSequence; releasedAt=at;
        message={...message,kind:"released",source:"ANCHOR release",dtg:fmtDTG(at),received:at.toISOString(),reference:`${message.originator} ${message.type} ${assignment.localSequence}`,
          localSequence:assignment.localSequence,msn:assignment.msn,releasedAt:at.toISOString(),releasedBy:user.id,releaseDesignation:authority.designation};
        await client.query("UPDATE command_routing SET settings=jsonb_set(settings,'{nextSequence}',$2::jsonb),revision=revision+1,updated_at=now() WHERE command_id=$1",[user.commandId,JSON.stringify(assignment.nextSequence)]);
        route=route.map((entry)=>entry.order===step.order?{...entry,status:"released",actedAt:at.toISOString(),comment}:entry);
        status="released"; event="released"; eventComment=`Released in ANCHOR as ${authority.designation}, ${assignment.localSequence}. External transmission not performed.`;
      }
    }
    const revision=row.routing_revision+1;
    if (releasedAt) {
      message = { ...message, c2oixId: `ANCHOR-${message.id}`, sha256: sha256(message.rawText), sizeKb: Math.max(1, Math.ceil(Buffer.byteLength(message.rawText) / 1024)) };
      await storeMessage(client, message.rawText, message, user.id);
    }
    await client.query(`UPDATE outgoing_messages SET record=$2::jsonb,workflow_status=$3,routing_route=$4::jsonb,workflow_id=$5,routing_revision=$6,updated_at=$7,
        released_at=$8,released_by=$9,release_sequence=$10,received_at=$11 WHERE id=$1`,
      [id,JSON.stringify(message),status,JSON.stringify(route),workflowId,revision,at,releasedAt,releasedAt?user.id:null,releaseSequence,message.received]);
    await appendRoutingEvent(client,message,user,revision,event,eventComment,stepTitle,at);
    await client.query("COMMIT");
    return message;
  } catch(error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
