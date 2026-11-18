import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export function useProjects() {
  const [items, setItems] = useState([]);
  useEffect(() => { api.get("/projects", { params: { page_size: 200 } }).then(({ data }) => setItems(data.items)); }, []);
  return items;
}

export const projectOpts = (ps) => ps.map((p) => ({ v: p.id, l: `${p.code} · ${p.name}` }));
export const accountOpts = (accs = [], groups) => accs.filter((a) => a.is_active && (!groups || groups.includes(a.group_code))).map((a) => ({ v: a.id, l: `${a.code} · ${a.name}` }));
export const bankOpts = (banks = []) => banks.filter((b) => b.is_active).map((b) => ({ v: b.id, l: `${b.name}${b.kind !== "Bank" ? ` (${b.kind})` : ""}` }));
export const refOpts = (list = []) => list.map((x) => ({ v: x.id, l: x.name }));
