import type { CommandSettings, Draft, Person, ReleaseAuthority, RoutingEvent, RoutingWorkflow } from "./types";
import type { TemplateDefinition, TemplateValues } from "./message-templates";

export interface ApiDraft extends Draft {
  revision: number;
  templateVersionId: string;
  templateName: string;
  templateVersion: number;
  commandSelections: Record<string, { id: string; name: string }[]>;
  definition: TemplateDefinition;
  inputValues: TemplateValues;
  drafterName: string;
}
export interface ApiRoutingEvent extends RoutingEvent {
  actorName: string;
  revision: number;
  snapshotHash: string;
}
export interface RoutingConfiguration {
  revision: number;
  workflows: RoutingWorkflow[];
  authorities: ReleaseAuthority[];
  settings: CommandSettings;
  people: Person[];
}
export type DraftAction = "submit" | "advance" | "return" | "release" | "withdraw";
