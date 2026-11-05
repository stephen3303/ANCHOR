import type { CommandSettings, Draft, Person, ReleaseAuthority, RoutingEvent, RoutingWorkflow, RouteStep } from "./types";
import type { TemplateDefinition, TemplateValues } from "./message-templates";

export interface ApiDraft extends Draft {
  revision: number;
  customRoute: boolean;
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
  routeSnapshot: RouteStep[];
}
export interface RoutingPerson extends Person { canRelease: boolean }
export interface RoutingConfiguration {
  revision: number;
  workflows: RoutingWorkflow[];
  authorities: ReleaseAuthority[];
  settings: CommandSettings;
  people: RoutingPerson[];
}
export type DraftAction = "submit" | "advance" | "return" | "release" | "withdraw";
