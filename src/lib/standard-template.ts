import standard from "../../database/seeds/standard-message.json";
import type { TemplateDefinition, TemplateField } from "./message-templates";

// The authored seed is the single source of truth. Do not resolve generators or
// invent defaults for manual fields when creating a template.
export const STANDARD_TEMPLATE_TEXT = standard.text;
export const STANDARD_FIELD_NAMES = [
  "Precedence", "DateTime", "Origin", "Recipients", "Info", "Classification", "Subject", "POC", "Message Number",
] as const;
export const LEGACY_STANDARD_NAMES: Readonly<Record<string, string>> = {
  "Msg Type": "Type", "Message DateTime": "DateTime", "Recipient Commands": "Recipients",
  "Info Commands": "Info", "Point of Contact": "POC", "Originator": "Origin", "Origin Command": "Origin",
};

export function standardField(name: string): TemplateField | undefined {
  if (!STANDARD_FIELD_NAMES.some((item) => item === name)) return undefined;
  return structuredClone(standard.fields.find((field) => field.name === name)) as TemplateField;
}

export function newStandardTemplate(): TemplateDefinition {
  return structuredClone(standard) as TemplateDefinition;
}

/** Prepare an editable copy only; never rewrite a saved version or message pin. */
export function prepareTemplateEdit(definition: TemplateDefinition): TemplateDefinition {
  const names = new Set(definition.fields.map((field) => field.name));
  const rename = (name: string) => LEGACY_STANDARD_NAMES[name] && !names.has(LEGACY_STANDARD_NAMES[name]) ? LEGACY_STANDARD_NAMES[name] : name;
  return {
    ...definition,
    text: definition.text.replace(/{{([^{}]*)}}/g, (placeholder, raw: string) => rename(raw.trim()) === raw.trim() ? placeholder : `{{ ${rename(raw.trim())} }}`),
    fields: definition.fields.map((field) => {
      const name = rename(field.name);
      return standardField(name) ?? { ...field, name, control: String(field.control) === "number" ? "text" : field.control };
    }),
  };
}
