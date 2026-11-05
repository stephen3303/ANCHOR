// Shared compliant envelope for API/browser tests of custom template controls.
import { readFileSync } from "node:fs";
const standard = JSON.parse(readFileSync(new URL("../database/seeds/standard-message.json", import.meta.url), "utf8"));
export const standardTemplateText = standard.text;
export const standardNames = ["Precedence", "DateTime", "Origin", "Recipients", "Info", "Classification", "Subject", "POC", "Message Number"];
export const standardInputNames = standardNames.filter((name) => name !== "Origin");
export function templateFixture(custom) {
  const text = standard.text.replace("RMKS/{{ Body }}//", custom.text);
  const available = [...custom.fields, ...standard.fields];
  const names = [...new Set([...text.matchAll(/{{([^{}]*)}}/g)].map((match) => match[1].trim()))];
  return { ...custom, text, fields: names.map((name) => structuredClone(available.find((field) => field.name === name))) };
}
export function authorFields(fields) {
  return fields.map((field) => Object.fromEntries(Object.entries(field).filter(([key]) => key !== "reference")));
}
export function standardInputValues(commandId) {
  return { Precedence: "R - Routine", DateTime: "050800Z NOV 26", Recipients: [commandId], Info: [commandId], Classification: "UNCLASSIFIED", Subject: "Test subject", POC: "LT Test", "Message Number": "1" };
}
export function customMessageBody(text) {
  return text.split("POC/LT Test//\n")[1]?.split("\nBT\n")[0];
}
