"use client";

// Renders message-table headers and cells in the shared column order
// (src/lib/message-columns.ts). A table names the fields it shows and how to
// draw each one; the order and the header labels come from the shared config,
// so no table can drift from the Messages page.
import type { ReactNode } from "react";
import { MESSAGE_COLUMN_LABELS, orderMessageColumns, type MessageColumn } from "@/lib/message-columns";
import { cx, td, th, theadRow } from "@/components/ui";

type CellDef<T> = {
  cell: (row: T) => ReactNode;
  className?: string | ((row: T) => string | false | undefined);
  /** Replaces the text label, e.g. with an icon or a select-all box. */
  header?: ReactNode;
  headerClassName?: string;
  /** Clicks inside this cell do not trigger the row's own click. */
  stopRowClick?: boolean;
};

export type MessageCells<T> = Partial<Record<MessageColumn, CellDef<T> | ((row: T) => ReactNode)>>;

export type ResolvedColumn<T> = CellDef<T> & { key: MessageColumn };

export function messageColumns<T>(cells: MessageCells<T>): ResolvedColumn<T>[] {
  return orderMessageColumns(Object.keys(cells) as MessageColumn[]).map((key) => {
    const def = cells[key]!;
    return typeof def === "function" ? { key, cell: def } : { key, ...def };
  });
}

export function MessageHeaderRow<T>({ cols }: { cols: ResolvedColumn<T>[] }) {
  return (
    <tr className={theadRow}>
      {cols.map((c) => (
        <th key={c.key} className={cx(th, c.headerClassName)}>
          {c.header ?? MESSAGE_COLUMN_LABELS[c.key]}
        </th>
      ))}
    </tr>
  );
}

export function MessageCellsRow<T>({ cols, row }: { cols: ResolvedColumn<T>[]; row: T }) {
  return (
    <>
      {cols.map((c) => (
        <td
          key={c.key}
          className={cx(td, typeof c.className === "function" ? c.className(row) : c.className)}
          onClick={c.stopRowClick ? (e) => e.stopPropagation() : undefined}
        >
          {c.cell(row)}
        </td>
      ))}
    </>
  );
}
