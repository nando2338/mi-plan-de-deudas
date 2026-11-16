export const db: { rows: any[] } = { rows: [] };
export function createClient() {
  return {
    from(_t: string) {
      let q: any = { eq: null, order: null };
      const api: any = {
        select() { return api; },
        eq(_c: string, v: string) { q.eq = v; return api; },
        order() { q.order = true; return api; },
        limit() { return api; },
        async maybeSingle() {
          let r = db.rows.slice();
          if (q.eq) r = r.filter((x) => x.fecha === q.eq);
          if (q.order) r.sort((a, b) => b.fecha.localeCompare(a.fecha));
          return { data: r[0] ?? null, error: null };
        },
        async upsert(row: any) { if (!db.rows.some((x) => x.fecha === row.fecha)) db.rows.push(row); return { error: null }; },
      };
      return api;
    },
  };
}
